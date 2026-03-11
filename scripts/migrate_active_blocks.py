#!/usr/bin/env python3
"""
Active Block (Virtual Block) Migration Script - Local Development

Migrates 277 active plantings from OldData/220126/farm_block_rows.sql
into the local MongoDB as virtual blocks under their parent physical blocks.

Uses the add-virtual-crop API endpoint to create proper virtual blocks,
then patches state/dates via MongoDB for imported records.

Yield strategy:
  plantCount = drips (old system's planting points)
  predicted_yield = plantCount * yieldPerPlant (from crop data)
  area = proportional to drips ratio on parent block

State mapping:
  Planted   -> growing   (plantingDate = time_start)
  Harvested -> harvesting (plantingDate = time_start)
  Planned   -> planned   (plantingDate = time_start)

Unmatched crop: "Lettuce - Phase 1 (5cm)" (1 block, NH-01-1) -> skip
"""

import re
import json
import sys
import requests
import subprocess
from collections import defaultdict

BASE_URL = "http://localhost/api/v1"
ADMIN_EMAIL = "admin@a64platform.com"
ADMIN_PASSWORD = "SuperAdmin123!"

# State mapping: old system state -> our BlockStatus
STATE_MAP = {
    "Planted": "growing",
    "Harvested": "harvesting",
    "Planned": "planned",
}

# Farm name normalization
FARM_NAME_FIX = {
    "New Hydroponic": "New Hydroponics",
}


def login():
    resp = requests.post(
        f"{BASE_URL}/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=15,
    )
    if resp.status_code != 200:
        print(f"Login failed: {resp.status_code} {resp.text}")
        sys.exit(1)
    print(f"Logged in as {ADMIN_EMAIL}")
    return resp.json()["access_token"]


def load_block_mapping():
    """Load legacyBlockCode -> blockId mapping"""
    with open("scripts/block_id_mapping.json") as f:
        return json.load(f)


def load_farm_mapping():
    """Load farmName -> farmId mapping"""
    with open("scripts/farm_id_mapping.json") as f:
        raw = json.load(f)
    name_map = {}
    for old_ref, info in raw.items():
        name_map[info["name"]] = info["new_id"]
    return name_map


def get_crop_id_map():
    """Get plantName -> plantDataId mapping from MongoDB"""
    result = subprocess.run(
        [
            "docker", "exec", "a64core-mongodb-dev", "mongosh", "--eval",
            'JSON.stringify(db.plant_data_enhanced.find({}, {plantName: 1, plantDataId: 1, _id: 0}).toArray())',
            "a64core_db", "--quiet",
        ],
        capture_output=True, text=True, timeout=30,
    )
    if result.returncode != 0:
        print(f"ERROR getting crop map: {result.stderr[:300]}")
        sys.exit(1)
    data = json.loads(result.stdout.strip())
    return {d["plantName"]: d["plantDataId"] for d in data}


def get_parent_block_info(block_id_mapping):
    """Get parent block area/farmId/maxPlants from MongoDB"""
    block_ids = list(block_id_mapping.values())
    query = json.dumps({"blockId": {"$in": block_ids}})
    result = subprocess.run(
        [
            "docker", "exec", "a64core-mongodb-dev", "mongosh", "--eval",
            f'JSON.stringify(db.blocks.find({query}, {{blockId: 1, blockCode: 1, area: 1, farmId: 1, farmCode: 1, maxPlants: 1, _id: 0}}).toArray())',
            "a64core_db", "--quiet",
        ],
        capture_output=True, text=True, timeout=30,
    )
    if result.returncode != 0:
        print(f"ERROR getting parent blocks: {result.stderr[:300]}")
        sys.exit(1)
    data = json.loads(result.stdout.strip())
    return {d["blockId"]: d for d in data}


def parse_farm_blocks():
    """Parse all 277 active blocks from farm_block_rows.sql"""
    with open("OldData/220126/farm_block_rows.sql") as f:
        content = f.read()

    rows = re.findall(
        r"'(\d+)',"          # drips
        r" '(\d+)',"         # season
        r" '(Planted|Harvested|Planned)',"  # state
        r" '([^']*)',"       # time_finish
        r" '([^']*)',"       # time_start
        r" '([^']*)',"       # ref
        r" '([^']*)',"       # farm_details_ref
        r" '([^']*)',"       # block_standard_ref
        r" '([^']*)',"       # standard_planning_ref
        r" '([^']*)',"       # block_id
        r" '([^']*)',"       # farm_name
        r" '([^']*)',"       # Item (crop name)
        r" '([^']*)',"       # isModified
        r" (null|'[^']*'),"  # input_data
        r" '([^']*)'"         # viewing_year
        , content,
    )

    blocks = []
    for row in rows:
        drips, season, state, time_finish, time_start, ref, farm_ref, \
            block_std_ref, planning_ref, block_id, farm_name, crop, \
            is_modified, input_data, viewing_year = row

        farm_name = FARM_NAME_FIX.get(farm_name, farm_name)

        # Parent code: NH-01-xxx -> NH-01, A-21-002 -> A-21
        if block_id.startswith("NH-01"):
            parent_code = "NH-01"
        else:
            parent_code = re.sub(r"-\d{3}$", "", block_id)

        blocks.append({
            "block_id": block_id,
            "parent_code": parent_code,
            "farm_name": farm_name,
            "crop": crop,
            "state": state,
            "drips": int(drips),
            "time_start": time_start,
            "time_finish": time_finish,
            "ref": ref,
        })

    print(f"Parsed {len(blocks)} active blocks")
    return blocks


def create_virtual_block(token, farm_id, parent_block_id, crop_id, area, plant_count, planting_date):
    """Create a virtual block via API"""
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    payload = {
        "cropId": crop_id,
        "allocatedArea": area,
        "plantCount": plant_count,
        "plantingDate": planting_date,
    }
    resp = requests.post(
        f"{BASE_URL}/farm/farms/{farm_id}/blocks/{parent_block_id}/add-virtual-crop",
        headers=headers,
        json=payload,
        timeout=30,
    )
    if resp.status_code in (200, 201):
        body = resp.json()
        return body.get("data", body) if isinstance(body, dict) and "data" in body else body
    else:
        return {"error": resp.status_code, "detail": resp.text[:300]}


def batch_update_mongodb(updates):
    """Batch update virtual blocks in MongoDB for state/dates/legacyCodes"""
    if not updates:
        return

    commands = []
    for u in updates:
        block_id = u["blockId"]
        set_parts = []

        if u.get("state"):
            set_parts.append(f'state: "{u["state"]}"')
        if u.get("plantedDate"):
            set_parts.append(f'plantedDate: ISODate("{u["plantedDate"]}")')
        if u.get("expectedHarvestDate"):
            set_parts.append(f'expectedHarvestDate: ISODate("{u["expectedHarvestDate"]}")')
        if u.get("legacyBlockCode"):
            escaped = u["legacyBlockCode"].replace('"', '\\"')
            set_parts.append(f'legacyBlockCode: "{escaped}"')

        if not set_parts:
            continue

        set_str = ", ".join(set_parts)
        commands.append(
            f'db.blocks.updateOne({{blockId: "{block_id}"}}, {{$set: {{{set_str}}}}})'
        )

    script = "; ".join(commands)
    result = subprocess.run(
        ["docker", "exec", "a64core-mongodb-dev", "mongosh", "--eval", script, "a64core_db", "--quiet"],
        capture_output=True, text=True, timeout=120,
    )
    if result.returncode != 0:
        print(f"  MongoDB batch update error: {result.stderr[:300]}")
    else:
        print(f"  Updated {len(commands)} virtual blocks in MongoDB")


def main():
    print("=" * 60)
    print("Active Block Migration - farm_block -> Virtual Blocks")
    print("=" * 60)

    # Phase 0: Load all mappings
    token = login()
    block_mapping = load_block_mapping()   # legacyBlockCode -> blockId
    farm_mapping = load_farm_mapping()     # farmName -> farmId
    crop_map = get_crop_id_map()           # plantName -> plantDataId

    print(f"\nMappings loaded:")
    print(f"  Physical blocks: {len(block_mapping)}")
    print(f"  Farms: {len(farm_mapping)}")
    print(f"  Crops: {len(crop_map)}")

    # Phase 1: Parse all active blocks
    blocks = parse_farm_blocks()

    # Get parent block info from MongoDB
    parent_info = get_parent_block_info(block_mapping)
    print(f"  Parent block info: {len(parent_info)} blocks")

    # Group by parent
    by_parent = defaultdict(list)
    for b in blocks:
        by_parent[b["parent_code"]].append(b)

    # Pre-flight checks
    print("\nPre-flight checks...")
    errors = []

    missing_farms = {b["farm_name"] for b in blocks if b["farm_name"] not in farm_mapping}
    if missing_farms:
        errors.append(f"Missing farms: {missing_farms}")

    missing_parents = {b["parent_code"] for b in blocks if b["parent_code"] not in block_mapping}
    if missing_parents:
        errors.append(f"Missing parent blocks: {missing_parents}")

    missing_crops = {b["crop"] for b in blocks if b["crop"] not in crop_map}
    if missing_crops:
        skipped_list = {c: [b["block_id"] for b in blocks if b["crop"] == c] for c in missing_crops}
        print(f"  WARNING: Unmatched crops (will skip):")
        for crop, bids in skipped_list.items():
            print(f"    '{crop}': {len(bids)} blocks -> {bids}")

    if errors:
        for e in errors:
            print(f"  ERROR: {e}")
        sys.exit(1)

    print("  All checks passed!")

    # Phase 2: Create virtual blocks via API
    importable = len([b for b in blocks if b["crop"] in crop_map])
    print(f"\nCreating {importable} virtual blocks (skipping {len(blocks) - importable} unmatched)...\n")

    created = 0
    failed = 0
    skipped = 0
    mongo_updates = []

    for parent_code in sorted(by_parent.keys()):
        siblings = by_parent[parent_code]
        parent_block_id = block_mapping[parent_code]
        parent = parent_info.get(parent_block_id, {})
        parent_area = parent.get("area", 5000)
        farm_id = parent.get("farmId", "")

        if not farm_id:
            farm_id = farm_mapping.get(siblings[0]["farm_name"], "")

        # Calculate area proportionally based on drips
        # Each sibling gets: (its_drips / total_drips) * parent_area
        total_drips = sum(b["drips"] for b in siblings if b["crop"] in crop_map)
        if total_drips == 0:
            total_drips = 1  # safety

        for idx, b in enumerate(siblings):
            if b["crop"] not in crop_map:
                print(f"  SKIP {b['block_id']} - crop '{b['crop']}' not in plant library")
                skipped += 1
                continue

            crop_id = crop_map[b["crop"]]
            plant_count = b["drips"] if b["drips"] > 0 else 100

            # Area proportional to drips ratio
            alloc_area = round((b["drips"] / total_drips) * parent_area, 2)
            if alloc_area <= 0:
                alloc_area = 1.0  # minimum 1 sqm

            # Parse planting date: "2026-01-14 08:00:00+00" -> "2026-01-14T08:00:00Z"
            try:
                planting_date_iso = b["time_start"][:19].replace(" ", "T") + "Z"
            except (ValueError, IndexError):
                planting_date_iso = None

            result = create_virtual_block(
                token, farm_id, parent_block_id, crop_id,
                alloc_area, plant_count, planting_date_iso,
            )

            if "error" in result:
                print(f"  FAIL {b['block_id']}: {result['error']} - {result['detail'][:150]}")
                failed += 1
                continue

            new_block_id = result.get("blockId", "")
            created += 1

            # Parse harvest date
            try:
                harvest_date_iso = b["time_finish"][:19].replace(" ", "T") + "Z"
            except (ValueError, IndexError):
                harvest_date_iso = None

            target_state = STATE_MAP.get(b["state"], "growing")
            mongo_updates.append({
                "blockId": new_block_id,
                "state": target_state,
                "plantedDate": planting_date_iso,
                "expectedHarvestDate": harvest_date_iso,
                "legacyBlockCode": b["block_id"],
            })

        if len(siblings) > 1:
            ok = sum(1 for b in siblings if b["crop"] in crop_map)
            print(f"  {parent_code}: {ok} virtual blocks [area/drip-proportional from {parent_area} sqm]")

    print(f"\nPhase 2 complete: {created} created, {failed} failed, {skipped} skipped")

    # Phase 3: Batch update MongoDB for state/dates/legacyCodes
    print(f"\nPhase 3: Setting state/dates/legacyBlockCode on {len(mongo_updates)} blocks...")

    batch_size = 50
    for i in range(0, len(mongo_updates), batch_size):
        batch = mongo_updates[i:i + batch_size]
        batch_update_mongodb(batch)

    # Phase 4: Verification
    print("\nPhase 4: Verification...")
    verify_script = """
    var virtual = db.blocks.countDocuments({blockCategory: "virtual"});
    var byState = db.blocks.aggregate([
        {$match: {blockCategory: "virtual"}},
        {$group: {_id: "$state", count: {$sum: 1}}},
        {$sort: {_id: 1}}
    ]).toArray();
    var byFarm = db.blocks.aggregate([
        {$match: {blockCategory: "virtual"}},
        {$group: {_id: "$farmCode", count: {$sum: 1}}},
        {$sort: {_id: 1}}
    ]).toArray();
    var withLegacy = db.blocks.countDocuments({blockCategory: "virtual", legacyBlockCode: {$ne: null}});
    JSON.stringify({virtual: virtual, byState: byState, byFarm: byFarm, withLegacy: withLegacy});
    """
    result = subprocess.run(
        ["docker", "exec", "a64core-mongodb-dev", "mongosh", "--eval", verify_script, "a64core_db", "--quiet"],
        capture_output=True, text=True, timeout=30,
    )
    if result.returncode == 0:
        try:
            data = json.loads(result.stdout.strip())
            print(f"  Virtual blocks total: {data['virtual']}")
            print(f"  With legacyBlockCode: {data['withLegacy']}")
            print(f"  By state:")
            for s in data["byState"]:
                print(f"    {s['_id']}: {s['count']}")
            print(f"  By farm:")
            for f in data["byFarm"]:
                print(f"    {f['_id']}: {f['count']}")
        except json.JSONDecodeError:
            print(f"  Raw: {result.stdout[:500]}")
    else:
        print(f"  Verify error: {result.stderr[:300]}")

    print(f"\nDone! {created} virtual blocks created from {len(by_parent)} parent blocks.")


if __name__ == "__main__":
    main()
