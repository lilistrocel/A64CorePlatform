#!/usr/bin/env python3
"""
Block Migration Script - Local Development

Migrates 274 physical blocks from OldData/220126/block_standard_rows.sql
into the local MongoDB via the A64 Core Platform API.

Phase 1: Create blocks via API (gets auto-generated blockCode)
Phase 2: MongoDB update to set legacyBlockCode on each block

Skips: New Hydroponics/NH-01 junk block (1M sqm / 10M drips)
Maps: "New Hydroponic" blocks -> "New Hydroponics" farm (F007)
Zero-area blocks: set to 5000 sqm (0.5 ha default)
"""

import re
import json
import requests
import subprocess
import sys

BASE_URL = "http://localhost/api/v1"
ADMIN_EMAIL = "admin@a64platform.com"
ADMIN_PASSWORD = "SuperAdmin123!"

# Block type mapping: old -> new enum value
BLOCK_TYPE_MAP = {
    "Open Field": "openfield",
    "Green House": "greenhouse",
    "Hydroponic": "hydroponic",
    "Net House": "nethouse",
}

# Farm name normalization (old inconsistent names -> canonical name)
FARM_NAME_FIX = {
    "New Hydroponic": "New Hydroponics",  # Missing 's' in some block_standard rows
}

DEFAULT_AREA_SQM = 5000  # 0.5 ha for blocks with zero area


def login():
    resp = requests.post(f"{BASE_URL}/auth/login",
                         json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                         timeout=15)
    if resp.status_code != 200:
        print(f"Login failed: {resp.status_code} {resp.text}")
        sys.exit(1)
    print(f"Logged in as {ADMIN_EMAIL}")
    return resp.json()["access_token"]


def load_farm_mapping():
    with open("scripts/farm_id_mapping.json") as f:
        raw = json.load(f)
    # Build name -> new_id mapping
    name_map = {}
    for old_ref, info in raw.items():
        name_map[info["name"]] = info["new_id"]
    return name_map


def parse_block_standard():
    with open("OldData/220126/block_standard_rows.sql") as f:
        content = f.read()

    # (Area, BlockID, TotalDrips, ref, farm_details_ref, farm_types_ref, farm, type)
    rows = re.findall(
        r"\('([^']*)', '([^']*)', '([^']*)', '([^']*)', '([^']*)', '([^']*)', '([^']*)', '([^']*)'\)",
        content,
    )

    blocks = []
    skipped = 0
    for area, block_id, drips, ref, farm_ref, farm_type_ref, farm, btype in rows:
        area_num = float(area) if area else 0
        drips_num = int(drips) if drips else 0

        # Skip junk block
        if drips_num > 100000 or area_num > 500000:
            print(f"  SKIP junk: {farm}/{block_id} area={area}sqm drips={drips}")
            skipped += 1
            continue

        # Normalize farm name
        farm_name = FARM_NAME_FIX.get(farm, farm)

        # Default area for zero-area blocks
        if area_num <= 0:
            area_num = DEFAULT_AREA_SQM

        blocks.append({
            "legacy_block_code": block_id,
            "old_ref": ref,
            "farm_name": farm_name,
            "farm_ref": farm_ref,
            "block_type": BLOCK_TYPE_MAP.get(btype, "openfield"),
            "max_plants": drips_num,
            "area": area_num,
        })

    print(f"Parsed {len(blocks)} blocks ({skipped} skipped)")
    return blocks


def create_block(token, farm_id, block):
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    payload = {
        "maxPlants": block["max_plants"],
        "blockType": block["block_type"],
        "area": block["area"],
        "areaUnit": "sqm",
    }
    resp = requests.post(
        f"{BASE_URL}/farm/farms/{farm_id}/blocks",
        headers=headers,
        json=payload,
        timeout=15,
    )
    if resp.status_code in (200, 201):
        body = resp.json()
        return body.get("data", body) if isinstance(body, dict) and "data" in body else body
    else:
        print(f"    FAIL {resp.status_code}: {resp.text[:200]}")
        return None


def set_legacy_codes_mongodb(mappings):
    """Batch update legacyBlockCode via mongosh"""
    if not mappings:
        return

    # Build a single mongosh script
    updates = []
    for block_id, legacy_code in mappings:
        escaped = legacy_code.replace('"', '\\"')
        updates.append(
            f'db.blocks.updateOne({{blockId: "{block_id}"}}, {{$set: {{legacyBlockCode: "{escaped}"}}}})'
        )

    script = "; ".join(updates)
    result = subprocess.run(
        ["docker", "exec", "a64core-mongodb-dev", "mongosh", "--eval", script, "a64core_db", "--quiet"],
        capture_output=True, text=True, timeout=60,
    )
    if result.returncode != 0:
        print(f"  MongoDB update error: {result.stderr[:300]}")
    else:
        print(f"  Set legacyBlockCode on {len(mappings)} blocks")


def main():
    print("=" * 60)
    print("Block Migration - block_standard -> Local MongoDB")
    print("=" * 60)

    token = login()
    farm_map = load_farm_mapping()
    blocks = parse_block_standard()

    # Group blocks by farm
    by_farm = {}
    for b in blocks:
        by_farm.setdefault(b["farm_name"], []).append(b)

    print(f"\nBlocks by farm:")
    for farm, farm_blocks in sorted(by_farm.items()):
        farm_id = farm_map.get(farm, "???")
        print(f"  {farm}: {len(farm_blocks)} blocks -> {farm_id[:8] if farm_id != '???' else '???'}...")

    # Check all farms exist in mapping
    missing = [f for f in by_farm if f not in farm_map]
    if missing:
        print(f"\nERROR: Farms not in mapping: {missing}")
        sys.exit(1)

    # Create blocks via API
    print(f"\nCreating {len(blocks)} blocks...\n")
    created = 0
    failed = 0
    legacy_mappings = []  # (new_block_id, legacy_code)

    for farm_name in sorted(by_farm.keys()):
        farm_blocks = by_farm[farm_name]
        farm_id = farm_map[farm_name]
        print(f"  {farm_name} ({len(farm_blocks)} blocks):")

        for b in farm_blocks:
            result = create_block(token, farm_id, b)
            if result:
                new_id = result["blockId"]
                new_code = result.get("blockCode", "?")
                legacy_mappings.append((new_id, b["legacy_block_code"]))
                created += 1
            else:
                print(f"    FAIL: {b['legacy_block_code']}")
                failed += 1

        print(f"    -> {len(farm_blocks)} done")

    print(f"\nPhase 1 complete: {created} created, {failed} failed")

    # Phase 2: Set legacyBlockCode in MongoDB
    print(f"\nPhase 2: Setting legacyBlockCode on {len(legacy_mappings)} blocks...")

    # Process in batches of 50 to avoid command line limits
    batch_size = 50
    for i in range(0, len(legacy_mappings), batch_size):
        batch = legacy_mappings[i:i + batch_size]
        set_legacy_codes_mongodb(batch)

    # Save full mapping for future use (block migration phases)
    mapping_file = "scripts/block_id_mapping.json"
    block_mapping = {}
    for new_id, legacy_code in legacy_mappings:
        block_mapping[legacy_code] = new_id
    with open(mapping_file, "w") as f:
        json.dump(block_mapping, f, indent=2)
    print(f"\nMapping saved to {mapping_file}")

    # Verify
    print("\nVerifying...")
    verify_cmd = 'db.blocks.aggregate([{$group: {_id: "$farmCode", count: {$sum: 1}, withLegacy: {$sum: {$cond: [{$ne: ["$legacyBlockCode", null]}, 1, 0]}}}}, {$sort: {_id: 1}}]).toArray()'
    result = subprocess.run(
        ["docker", "exec", "a64core-mongodb-dev", "mongosh", "--eval", verify_cmd, "a64core_db", "--quiet"],
        capture_output=True, text=True, timeout=30,
    )
    print(result.stdout[:1000])

    print(f"\nDone! {created} physical blocks created across {len(by_farm)} farms.")


if __name__ == "__main__":
    main()
