#!/usr/bin/env python3
"""
Generate JSON for physical blocks migration
"""

import re
import json

# Farm prefix to farmId mapping
FARM_MAPPING = {
    "A": ("6d6360d5-19d6-41da-ba72-7a9559503857", "F004"),
    "AG": ("6d6360d5-19d6-41da-ba72-7a9559503857", "F004"),
    "WG": ("222fa041-081a-41bf-a855-d39d26ae4136", "F002"),
    "NH": ("de209b10-ee5c-4b62-b97a-50621eaceb4b", "F007"),
    "LW": ("cd98f1da-c377-486b-acb0-2a46ea78019a", "F006"),
    "TV": ("69ab8d2f-3d20-4363-8895-86e159a13f35", "F003"),
    "TVGH": ("69ab8d2f-3d20-4363-8895-86e159a13f35", "F003"),
    "TVNH": ("69ab8d2f-3d20-4363-8895-86e159a13f35", "F003"),
    "KHZ": ("c82d1236-ceff-4b71-b883-8db0fbc383c5", "F005"),
}

BLOCK_TYPE_MAP = {
    "Open Field": "openfield",
    "Green House": "greenhouse",
    "Hydroponic": "hydroponic",
}


def get_farm_info(block_id, farm_name):
    """Get farmId and farmCode from block prefix or farm name"""
    # Try prefix matching
    for prefix in sorted(FARM_MAPPING.keys(), key=len, reverse=True):
        if block_id.upper().startswith(prefix):
            return FARM_MAPPING[prefix]

    # Fallback to farm name
    name_map = {
        "Al Ain": ("6d6360d5-19d6-41da-ba72-7a9559503857", "F004"),
        "Al Wagen": ("222fa041-081a-41bf-a855-d39d26ae4136", "F002"),
        "New Hydroponic": ("de209b10-ee5c-4b62-b97a-50621eaceb4b", "F007"),
        "New Hydroponics": ("de209b10-ee5c-4b62-b97a-50621eaceb4b", "F007"),
        "Liwa": ("cd98f1da-c377-486b-acb0-2a46ea78019a", "F006"),
        "Asharij-Television Farm": ("69ab8d2f-3d20-4363-8895-86e159a13f35", "F003"),
        "Al Khazana": ("c82d1236-ceff-4b71-b883-8db0fbc383c5", "F005"),
        "Silal Upgrade Farm": ("04d07eb0-3667-4900-90e4-1a89ffc2401b", "F001"),
    }
    return name_map.get(farm_name, (None, None))


def extract_block_number(block_id):
    """Extract numeric part from block ID.

    Examples:
        A-21 → 21
        LW-10 → 10
        NH-05 → 5
        TVGH-03 → 3
        S.GH 708 - 16458 → 16458
    """
    # Find the last number in the block_id
    numbers = re.findall(r'\d+', block_id)
    if numbers:
        return int(numbers[-1])
    return 0


def parse_sql():
    """Parse block_standard SQL"""
    with open('OldData/220126/block_standard_rows.sql') as f:
        content = f.read()

    blocks = []

    values_start = content.find("VALUES")
    values_section = content[values_start + 7:]

    for match in re.finditer(r"\(([^)]+)\)", values_section):
        try:
            raw = match.group(1)
            fields = raw.replace("'", "").split(", ")

            if len(fields) >= 8:
                area = fields[0].strip()
                block_id = fields[1].strip()
                total_drips = fields[2].strip()
                ref = fields[3].strip()
                farm_name = fields[6].strip()
                block_type = fields[7].strip()

                farm_id, farm_code = get_farm_info(block_id, farm_name)

                if not farm_id:
                    print(f"Warning: No farm mapping for {block_id} ({farm_name})")
                    continue

                # Extract original block number from legacy code
                seq = extract_block_number(block_id)
                new_code = f"{farm_code}-{seq:03d}"

                blocks.append({
                    "blockId": ref,
                    "blockCode": new_code,
                    "legacyBlockCode": block_id,
                    "farmId": farm_id,
                    "farmCode": farm_code,
                    "sequenceNumber": seq,
                    "area": float(area) if area and area != "null" else None,
                    "maxPlants": int(total_drips) if total_drips and total_drips != "null" else None,
                    "blockType": BLOCK_TYPE_MAP.get(block_type, "openfield"),
                })
        except Exception as e:
            print(f"Error: {e}")

    return blocks


if __name__ == "__main__":
    blocks = parse_sql()
    print(f"Total: {len(blocks)} blocks")

    # Output as JSON for mongosh
    with open('scripts/migrations/phase2/physical_blocks.json', 'w') as f:
        json.dump(blocks, f, indent=2)

    print("Written to scripts/migrations/phase2/physical_blocks.json")
