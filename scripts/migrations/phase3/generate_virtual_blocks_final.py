#!/usr/bin/env python3
"""
Phase 3: Migrate farm_block → Virtual Blocks (final parser)
Handles both JSON and empty InventoryData formats
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
    seen_refs = set()

    # Pattern 1: Records with JSON InventoryData (ends with }')
    # Format: }', 'drips', 'season', 'state', 'time_finish', 'time_start', 'ref', 'farm_ref', 'block_std_ref', 'plant_ref', 'block_id', 'farm_name', 'Item', ...
    pattern1 = r"\}',\s*'(\d+)',\s*'(\d+)',\s*'([^']+)',\s*'([^']*)',\s*'([^']*)',\s*'([a-f0-9-]+)',\s*'([a-f0-9-]+)',\s*'([a-f0-9-]+)',\s*'([a-f0-9-]+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)'"

    for m in re.finditer(pattern1, content):
        ref = m.group(6)
        if ref in seen_refs:
            continue
        seen_refs.add(ref)

        blocks.append({
            "blockId": ref,
            "legacyBlockCode": m.group(10),
            "parentLegacyCode": extract_parent_code(m.group(10)),
            "blockStandardRef": m.group(8),
            "plantRef": m.group(9) if m.group(9) and m.group(9) != "null" else None,
            "drips": int(m.group(1)) if m.group(1) else None,
            "state": STATE_MAP.get(m.group(3), "empty"),
            "originalState": m.group(3),
            "timeStart": m.group(5) if m.group(5) and "null" not in m.group(5).lower() else None,
            "timeFinish": m.group(4) if m.group(4) and "null" not in m.group(4).lower() else None,
            "cropName": m.group(12),
            "farmName": m.group(11),
            "season": int(m.group(2)) if m.group(2) else None,
        })

    # Pattern 2: Records with empty/minimal InventoryData (NH blocks)
    # Format: (', 'drips', 'season', 'state', ...
    pattern2 = r"\(',\s*'(\d+)',\s*'(\d+)',\s*'([^']+)',\s*'([^']*)',\s*'([^']*)',\s*'([a-f0-9-]+)',\s*'([a-f0-9-]+)',\s*'([a-f0-9-]+)',\s*'([a-f0-9-]+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)'"

    for m in re.finditer(pattern2, content):
        ref = m.group(6)
        if ref in seen_refs:
            continue
        seen_refs.add(ref)

        blocks.append({
            "blockId": ref,
            "legacyBlockCode": m.group(10),
            "parentLegacyCode": extract_parent_code(m.group(10)),
            "blockStandardRef": m.group(8),
            "plantRef": m.group(9) if m.group(9) and m.group(9) != "null" else None,
            "drips": int(m.group(1)) if m.group(1) else None,
            "state": STATE_MAP.get(m.group(3), "empty"),
            "originalState": m.group(3),
            "timeStart": m.group(5) if m.group(5) and "null" not in m.group(5).lower() else None,
            "timeFinish": m.group(4) if m.group(4) and "null" not in m.group(4).lower() else None,
            "cropName": m.group(12),
            "farmName": m.group(11),
            "season": int(m.group(2)) if m.group(2) else None,
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

    print("\nSample blocks:")
    for b in blocks[:3]:
        print(f"  {b['legacyBlockCode']} → {b['cropName']} ({b['farmName']}) - {b['state']}")

    # Show NH samples
    nh_blocks = [b for b in blocks if b['farmName'].startswith('New')]
    print(f"\nNH blocks: {len(nh_blocks)}")
    for b in nh_blocks[:3]:
        print(f"  {b['legacyBlockCode']} → {b['cropName']} - {b['state']}")

    # Save to JSON
    with open('scripts/migrations/phase3/virtual_blocks.json', 'w') as f:
        json.dump(blocks, f, indent=2)
    print(f"\nWritten to scripts/migrations/phase3/virtual_blocks.json")
