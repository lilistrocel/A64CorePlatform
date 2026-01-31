#!/usr/bin/env python3
"""
Phase 2: Migrate block_standard → Physical Blocks

Source: OldData/220126/block_standard_rows.sql
Target: MongoDB blocks collection (blockCategory: 'physical')
Records: 274
"""

import re

# Farm prefix to farmId mapping
FARM_MAPPING = {
    # Al Ain (F004)
    "A": ("6d6360d5-19d6-41da-ba72-7a9559503857", "F004"),
    "AG": ("6d6360d5-19d6-41da-ba72-7a9559503857", "F004"),

    # Al Wagen (F002)
    "WG": ("222fa041-081a-41bf-a855-d39d26ae4136", "F002"),

    # New Hydroponics (F007)
    "NH": ("de209b10-ee5c-4b62-b97a-50621eaceb4b", "F007"),

    # Liwa (F006)
    "LW": ("cd98f1da-c377-486b-acb0-2a46ea78019a", "F006"),

    # Asharij-Television Farm (F003)
    "TV": ("69ab8d2f-3d20-4363-8895-86e159a13f35", "F003"),
    "TVGH": ("69ab8d2f-3d20-4363-8895-86e159a13f35", "F003"),
    "TVNH": ("69ab8d2f-3d20-4363-8895-86e159a13f35", "F003"),

    # Al Khazana (F005)
    "KHZ": ("c82d1236-ceff-4b71-b883-8db0fbc383c5", "F005"),

    # Silal Upgrade Farm (F001) - various prefixes
    "S.GH": ("04d07eb0-3667-4900-90e4-1a89ffc2401b", "F001"),
    "S.NH": ("04d07eb0-3667-4900-90e4-1a89ffc2401b", "F001"),
    "S.NHY": ("04d07eb0-3667-4900-90e4-1a89ffc2401b", "F001"),
    "SNH": ("04d07eb0-3667-4900-90e4-1a89ffc2401b", "F001"),
}

# Block type mapping
BLOCK_TYPE_MAP = {
    "Open Field": "openfield",
    "Green House": "greenhouse",
    "Hydroponic": "hydroponic",
}


def get_farm_info(block_id):
    """Get farmId and farmCode from block prefix"""
    # Try exact match first (for compound prefixes like S.GH)
    for prefix in sorted(FARM_MAPPING.keys(), key=len, reverse=True):
        if block_id.startswith(prefix):
            return FARM_MAPPING[prefix]

    # Fallback: try first part
    first_part = block_id.split("-")[0]
    return FARM_MAPPING.get(first_part, (None, None))


def parse_block_standard_sql(filepath):
    """Parse block_standard SQL and extract block data"""
    with open(filepath) as f:
        content = f.read()

    # Schema: Area, BlockID, TotalDrips, ref, farm_details_ref, farm_types_ref, farm, type
    blocks = []

    # Find VALUES section
    values_start = content.find("VALUES")
    values_section = content[values_start + 7:]

    # Parse tuples
    for match in re.finditer(r"\(([^)]+)\)", values_section):
        try:
            # Split by ', ' but handle the first field which starts with '
            raw = match.group(1)
            # Remove leading/trailing quotes and split
            fields = raw.replace("'", "").split(", ")

            if len(fields) >= 8:
                area = fields[0]
                block_id = fields[1]
                total_drips = fields[2]
                ref = fields[3]
                farm_details_ref = fields[4]
                farm_types_ref = fields[5]
                farm_name = fields[6]
                block_type = fields[7]

                # Get farm info from block prefix
                farm_id, farm_code = get_farm_info(block_id)

                # Generate new block code
                # Extract number from block_id (e.g., "A-31" -> 31)
                parts = block_id.split("-")
                if len(parts) >= 2:
                    try:
                        seq_num = int(parts[-1])
                    except ValueError:
                        seq_num = len(blocks) + 1
                else:
                    seq_num = len(blocks) + 1

                new_code = f"{farm_code}-{seq_num:03d}" if farm_code else f"BLK-{len(blocks)+1:03d}"

                blocks.append({
                    "blockId": ref,
                    "blockCode": new_code,
                    "legacyBlockCode": block_id,
                    "farmId": farm_id or farm_details_ref,
                    "farmCode": farm_code,
                    "sequenceNumber": seq_num,
                    "area": float(area) if area else None,
                    "maxPlants": int(total_drips) if total_drips else None,
                    "blockType": BLOCK_TYPE_MAP.get(block_type, "openfield"),
                    "farmName": farm_name,
                    "originalFarmRef": farm_details_ref,
                })

        except Exception as e:
            print(f"Error parsing tuple: {e}")
            continue

    return blocks


def generate_mongosh_script(blocks):
    """Generate mongosh script for insertion"""
    print(f"// Phase 2: Physical Blocks Migration")
    print(f"// Total blocks: {len(blocks)}")
    print()
    print("const blocks = [")

    for b in blocks:
        print(f'  {{blockId: "{b["blockId"]}", blockCode: "{b["blockCode"]}", legacyBlockCode: "{b["legacyBlockCode"]}", farmId: "{b["farmId"]}", farmCode: "{b["farmCode"]}", seq: {b["sequenceNumber"]}, area: {b["area"] or "null"}, maxPlants: {b["maxPlants"] or "null"}, blockType: "{b["blockType"]}"}},')

    print("];")


if __name__ == "__main__":
    blocks = parse_block_standard_sql("OldData/220126/block_standard_rows.sql")
    print(f"Parsed {len(blocks)} blocks")
    print()

    # Show sample
    print("Sample blocks:")
    for b in blocks[:5]:
        print(f"  {b['legacyBlockCode']} → {b['blockCode']} (Farm: {b['farmCode']}, {b['farmName']})")

    print()
    print("Farm distribution:")
    farm_counts = {}
    for b in blocks:
        fc = b['farmCode'] or 'Unknown'
        farm_counts[fc] = farm_counts.get(fc, 0) + 1
    for fc, count in sorted(farm_counts.items()):
        print(f"  {fc}: {count} blocks")
