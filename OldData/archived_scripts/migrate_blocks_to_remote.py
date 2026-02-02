#!/usr/bin/env python3
"""
Migrate blocks from old database (block_standard.json) to remote MongoDB.

This script:
1. Reads block_standard.json (old Supabase export)
2. Maps old farm refs to new farm IDs
3. Normalizes block names (removes hyphens)
4. Maps block types to new enum values
5. Creates blocks via API on the remote server
"""

import json
import requests
from pathlib import Path

# Configuration
API_BASE_URL = "https://a64core.com/api/v1"
LOGIN_EMAIL = "admin@a64platform.com"
LOGIN_PASSWORD = "SuperAdmin123!"

# File paths
SCRIPT_DIR = Path(__file__).parent
BLOCK_STANDARD_FILE = SCRIPT_DIR / "json_exports" / "block_standard.json"
FARM_ID_MAPPING_FILE = SCRIPT_DIR / "farm_id_mapping.json"

# Type mapping from old to new
TYPE_MAPPING = {
    "Open Field": "openfield",
    "Green House": "greenhouse",
    "Greenhouse": "greenhouse",
    "Hydroponic": "hydroponic",
    "Net House": "nethouse",
    "Nethouse": "nethouse",
}

# Farm name mapping (old name -> new name in mapping file)
FARM_NAME_MAPPING = {
    "Al Ain": "Al Ain",  # Maps to "Al Ain Farm" in new DB
    "Al Khazana": "Al Khazana",
    "Silal Upgrade Farm": "Silal Upgrade Farm",
    "Al Wagen": "Al Wagen",
    "Liwa": "Liwa",
    "New Hydroponic": "New Hydroponics",  # Old name -> new name
    "New Hydroponics": "New Hydroponics",
}


def normalize_block_name(name: str) -> str:
    """
    Normalize block name by removing hyphens and extra characters.
    Examples:
        "A-29" -> "A29"
        "KHZ-01" -> "KHZ01"
        "S.NHY 428" -> "S.NHY 428" (keep as-is for special names)
    """
    # For standard format like A-29, KHZ-01, WG-01, LW-01, AG-01, NH-01
    if "-" in name and name.split("-")[0].isalpha() or name.split("-")[0].replace(".", "").isalpha():
        parts = name.split("-")
        if len(parts) == 2 and parts[1].isdigit():
            return f"{parts[0]}{parts[1]}"
    return name


def login() -> str:
    """Login and get access token."""
    print(f"Logging in as {LOGIN_EMAIL}...")
    response = requests.post(
        f"{API_BASE_URL}/auth/login",
        json={"email": LOGIN_EMAIL, "password": LOGIN_PASSWORD},
        timeout=30
    )
    response.raise_for_status()
    token = response.json()["access_token"]
    print("Login successful!")
    return token


def get_existing_blocks(token: str, farm_id: str) -> list:
    """Get existing blocks for a farm."""
    headers = {"Authorization": f"Bearer {token}"}
    response = requests.get(
        f"{API_BASE_URL}/farm/farms/{farm_id}/blocks",
        headers=headers,
        params={"perPage": 1000},
        timeout=30
    )
    if response.status_code == 200:
        return response.json().get("data", [])
    return []


def create_block(token: str, farm_id: str, block_data: dict) -> dict:
    """Create a block via API."""
    headers = {"Authorization": f"Bearer {token}"}
    response = requests.post(
        f"{API_BASE_URL}/farm/farms/{farm_id}/blocks",
        headers=headers,
        json=block_data,
        timeout=30
    )
    return {
        "status_code": response.status_code,
        "response": response.json() if response.status_code in [200, 201, 400, 422] else response.text
    }


def main():
    # Load farm ID mapping
    print(f"Loading farm ID mapping from {FARM_ID_MAPPING_FILE}...")
    with open(FARM_ID_MAPPING_FILE, "r") as f:
        farm_mapping = json.load(f)["farms"]

    # Load block data
    print(f"Loading block data from {BLOCK_STANDARD_FILE}...")
    with open(BLOCK_STANDARD_FILE, "r") as f:
        blocks = json.load(f)

    print(f"Total blocks in old data: {len(blocks)}")

    # Filter out the duplicate "New Hydroponics" test entry (the one with 1000000 sqm area)
    blocks = [b for b in blocks if not (b["farm"] == "New Hydroponics" and b["Area"] == 1000000)]
    print(f"Blocks after filtering duplicates: {len(blocks)}")

    # Group blocks by farm
    blocks_by_farm = {}
    for block in blocks:
        farm_name = block["farm"]
        # Map old farm name to mapping key
        mapped_name = FARM_NAME_MAPPING.get(farm_name, farm_name)
        if mapped_name not in blocks_by_farm:
            blocks_by_farm[mapped_name] = []
        blocks_by_farm[mapped_name].append(block)

    print("\nBlocks per farm:")
    for farm_name, farm_blocks in blocks_by_farm.items():
        print(f"  {farm_name}: {len(farm_blocks)} blocks")

    # Login
    token = login()

    # Process each farm
    results = {
        "created": 0,
        "skipped": 0,
        "failed": 0,
        "errors": []
    }

    for farm_name, farm_blocks in blocks_by_farm.items():
        print(f"\n{'='*60}")
        print(f"Processing farm: {farm_name}")
        print(f"{'='*60}")

        # Get farm ID from mapping
        if farm_name not in farm_mapping:
            print(f"  ERROR: Farm '{farm_name}' not found in mapping!")
            results["errors"].append(f"Farm '{farm_name}' not in mapping")
            continue

        farm_id = farm_mapping[farm_name]["new_id"]
        print(f"  Farm ID: {farm_id}")

        # Get existing blocks
        existing_blocks = get_existing_blocks(token, farm_id)
        existing_names = {b["name"] for b in existing_blocks if b.get("name")}
        print(f"  Existing blocks: {len(existing_blocks)}")

        # Create blocks
        for block in sorted(farm_blocks, key=lambda x: x["BlockID"]):
            old_name = block["BlockID"]
            new_name = normalize_block_name(old_name)

            # Skip if already exists
            if new_name in existing_names:
                print(f"  SKIP: {old_name} -> {new_name} (already exists)")
                results["skipped"] += 1
                continue

            # Map block type
            old_type = block.get("type", "Open Field")
            new_type = TYPE_MAPPING.get(old_type, "openfield")

            # Prepare block data
            block_data = {
                "name": new_name,
                "blockType": new_type,
                "maxPlants": block.get("TotalDrips", 1000),  # Use drips as proxy for max plants
                "area": block.get("Area", 0) if block.get("Area", 0) > 0 else None,
                "areaUnit": "sqm"
            }

            # Remove None values
            block_data = {k: v for k, v in block_data.items() if v is not None}

            print(f"  CREATE: {old_name} -> {new_name} ({new_type}, {block_data.get('maxPlants')} plants)")

            result = create_block(token, farm_id, block_data)

            if result["status_code"] in [200, 201]:
                results["created"] += 1
                existing_names.add(new_name)  # Track to avoid duplicates in same run
            else:
                results["failed"] += 1
                error_msg = f"{new_name}: {result['response']}"
                results["errors"].append(error_msg)
                print(f"    ERROR: {error_msg}")

    # Summary
    print(f"\n{'='*60}")
    print("MIGRATION SUMMARY")
    print(f"{'='*60}")
    print(f"Created: {results['created']}")
    print(f"Skipped (existing): {results['skipped']}")
    print(f"Failed: {results['failed']}")

    if results["errors"]:
        print(f"\nErrors ({len(results['errors'])}):")
        for error in results["errors"][:10]:  # Show first 10 errors
            print(f"  - {error}")
        if len(results["errors"]) > 10:
            print(f"  ... and {len(results['errors']) - 10} more errors")

    # Save results
    results_file = SCRIPT_DIR / "block_migration_results.json"
    with open(results_file, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nResults saved to: {results_file}")


if __name__ == "__main__":
    main()
