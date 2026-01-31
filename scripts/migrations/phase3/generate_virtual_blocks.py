#!/usr/bin/env python3
"""
Phase 3: Migrate farm_block → Virtual Blocks

Source: OldData/220126/farm_block_rows.sql
Target: MongoDB blocks collection (blockCategory: 'virtual')
Records: 277
"""

import re
import json
from datetime import datetime

# State mapping
STATE_MAP = {
    "Planted": "growing",
    "Harvested": "harvesting",
    "Planned": "planned",
}

# We need to link virtual blocks to physical blocks
# Physical blocks have legacyBlockCode like "A-31", "LW-10"
# Virtual blocks have block_id like "A-31-001", "LW-10-002"


def extract_parent_code(block_id):
    """Extract parent physical block code from virtual block code.

    Examples:
        A-31-001 → A-31
        LW-10-002 → LW-10
        NH-01-328 → NH-01
        S.GH 708 - 16458-001 → S.GH 708 - 16458
    """
    # Find the last dash followed by digits (the cycle number)
    # Split from the right
    parts = block_id.rsplit("-", 1)
    if len(parts) == 2 and parts[1].isdigit():
        return parts[0]
    return block_id


def parse_farm_block_sql(filepath):
    """Parse farm_block SQL and extract virtual block data"""
    with open(filepath) as f:
        content = f.read()

    # Schema: InventoryData, drips, plannedseason, state, time_finish, time_start,
    #         ref, farm_details_ref, block_standard_ref, standard_planning_ref,
    #         block_id, farm_name, Item, isModified, input_data, viewing_year

    blocks = []

    # Find VALUES section
    values_start = content.find("VALUES")
    values_section = content[values_start + 7:]

    # Parse each tuple - this is complex due to JSON in first field
    current_pos = 0
    tuple_count = 0

    while current_pos < len(values_section):
        # Find start of tuple
        start = values_section.find("('", current_pos)
        if start == -1:
            break

        # Find matching end - need to handle nested quotes
        depth = 0
        in_string = False
        i = start + 1
        while i < len(values_section):
            char = values_section[i]
            if char == "'" and (i == 0 or values_section[i-1] != "\\"):
                in_string = not in_string
            elif char == "(" and not in_string:
                depth += 1
            elif char == ")" and not in_string:
                if depth == 0:
                    break
                depth -= 1
            i += 1

        if i >= len(values_section):
            break

        tuple_str = values_section[start+1:i]
        current_pos = i + 1
        tuple_count += 1

        try:
            # Split carefully - find the fields after the JSON
            # The JSON ends with }', so find that
            json_end = tuple_str.find("}', '")
            if json_end == -1:
                continue

            rest = tuple_str[json_end + 4:]  # Skip }', '
            fields = rest.split("', '")

            if len(fields) >= 12:
                # fields[0] = drips
                # fields[1] = plannedseason
                # fields[2] = state
                # fields[3] = time_finish
                # fields[4] = time_start
                # fields[5] = ref (UUID)
                # fields[6] = farm_details_ref
                # fields[7] = block_standard_ref
                # fields[8] = standard_planning_ref (plant UUID)
                # fields[9] = block_id
                # fields[10] = farm_name
                # fields[11] = Item (crop name)

                drips = fields[0].replace("'", "").strip()
                state = fields[2].replace("'", "").strip()
                time_finish = fields[3].replace("'", "").strip()
                time_start = fields[4].replace("'", "").strip()
                ref = fields[5].replace("'", "").strip()
                block_standard_ref = fields[7].replace("'", "").strip()
                plant_ref = fields[8].replace("'", "").strip()
                block_id = fields[9].replace("'", "").strip()
                farm_name = fields[10].replace("'", "").strip()
                crop_name = fields[11].replace("'", "").strip()

                parent_code = extract_parent_code(block_id)

                blocks.append({
                    "blockId": ref,
                    "legacyBlockCode": block_id,
                    "parentLegacyCode": parent_code,
                    "blockStandardRef": block_standard_ref,
                    "plantRef": plant_ref if plant_ref and plant_ref != "null" else None,
                    "drips": int(drips) if drips and drips.isdigit() else None,
                    "state": STATE_MAP.get(state, "empty"),
                    "originalState": state,
                    "timeStart": time_start if time_start and "null" not in time_start.lower() else None,
                    "timeFinish": time_finish if time_finish and "null" not in time_finish.lower() else None,
                    "cropName": crop_name,
                    "farmName": farm_name,
                })

        except Exception as e:
            print(f"Error parsing tuple {tuple_count}: {e}")
            continue

    return blocks


if __name__ == "__main__":
    blocks = parse_farm_block_sql("OldData/220126/farm_block_rows.sql")
    print(f"Parsed {len(blocks)} virtual blocks")
    print()

    # Show state distribution
    states = {}
    for b in blocks:
        s = b["originalState"]
        states[s] = states.get(s, 0) + 1
    print("State distribution:")
    for s, c in sorted(states.items(), key=lambda x: -x[1]):
        print(f"  {s} → {STATE_MAP.get(s, 'empty')}: {c}")

    print()
    print("Sample blocks:")
    for b in blocks[:5]:
        print(f"  {b['legacyBlockCode']} (parent: {b['parentLegacyCode']}) - {b['cropName']} - {b['state']}")

    # Save to JSON
    with open('scripts/migrations/phase3/virtual_blocks.json', 'w') as f:
        json.dump(blocks, f, indent=2)
    print(f"\nWritten to scripts/migrations/phase3/virtual_blocks.json")
