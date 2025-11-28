#!/usr/bin/env python3
"""
Active Block Status Sync Script

Syncs 271 active blocks from OldData (farm_block_comp.json) to the remote MongoDB.
This script:
1. Removes incorrect archives (blocks that are currently active, not completed)
2. Updates block status, crop, dates, and KPIs from OldData
3. Preserves history with status changes

Data Source:
- OldData/json_exports/farm_block_comp.json (271 active records)

State Mapping:
- "Planted" -> "growing"
- "Harvested" -> "harvesting"
- "Planned" -> "planned"
"""

import json
import re
import asyncio
import argparse
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, List, Tuple
from motor.motor_asyncio import AsyncIOMotorClient

# MongoDB Connection
MONGO_URI = "mongodb://mongodb:27017"
DB_NAME = "a64core_db"

# System user for migration records
SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001"
SYSTEM_USER_EMAIL = "migration@a64platform.com"

# Farm ID mapping (from remote database)
FARM_MAPPING = {
    "Al Ain": "cd22c152-defa-47fa-88af-0b3b422b5700",
    "Al Ain Farm": "cd22c152-defa-47fa-88af-0b3b422b5700",
    "Al Khazana": "39d0cdd6-6519-46c9-96f8-966298e2199f",
    "Silal Upgrade Farm": "e743061e-68ac-4fcc-8bee-8a26de2e975e",
    "Al Wagen": "8af274db-99e3-417b-a871-e593647698a1",
    "Liwa": "1caa75cb-e23f-4d76-9c89-0154216a3e12",
    "New Hydroponics": "c3b5b397-5973-4414-a772-c889b131b59f",
}

# State mapping: OldData state -> BlockStatus
STATE_MAPPING = {
    "Planted": "growing",
    "Harvested": "harvesting",
    "Planned": "planned",
}


def normalize_block_code(old_code: str) -> str:
    """
    Normalize old block codes to match our database block names.

    Examples:
        A-01-001 -> A01
        WG-28-001 -> WG28
        LW-54-001 -> LW54
        KHZ-34-1 -> KHZ34
        AG-06-001 -> AG06
        S.NH 720 - 16457-004 -> S.NH 720 - 16457
    """
    # Check for Silal patterns BEFORE stripping (to preserve leading spaces)
    silal_patterns_preserve_space = [
        r"^(\s*S\.NHY\s+\d+)(-\d+)?$",
    ]

    for pattern in silal_patterns_preserve_space:
        match = re.match(pattern, old_code)
        if match:
            return match.group(1)

    code = old_code.strip()

    # Special case: Silal Upgrade Farm codes
    silal_patterns = [
        r"^(S\.NH\s+\d+\s+-\s+\d+)(-\d+)?$",
        r"^(S\.GH\s+\d+\s+-\s+\d+)(-\d+)?$",
        r"^(SNH\.\d+\s+-\s+\d+)(-\d+)?$",
    ]

    for pattern in silal_patterns:
        match = re.match(pattern, code)
        if match:
            return match.group(1)

    # Split by hyphen
    parts = code.split("-")

    # Remove season suffix if we have 3+ segments
    if len(parts) >= 3:
        parts = parts[:-1]

    code = "".join(parts)

    # Format consistently
    match = re.match(r"([A-Za-z]+)(\d+)", code)
    if match:
        prefix = match.group(1)
        number = int(match.group(2))
        return f"{prefix}{number:02d}" if number < 10 else f"{prefix}{number}"

    return code


def parse_datetime(dt_string: Optional[str]) -> Optional[datetime]:
    """Parse datetime string from old data."""
    if not dt_string:
        return None
    try:
        if dt_string.endswith("+00:00") or dt_string.endswith("Z"):
            dt_string = dt_string.replace("Z", "+00:00")
            return datetime.fromisoformat(dt_string)
        return datetime.fromisoformat(dt_string)
    except Exception:
        return None


class ActiveBlockSync:
    def __init__(self, dry_run: bool = False):
        self.client = None
        self.db = None
        self.dry_run = dry_run

        # Caches
        self.block_cache: Dict[str, Dict] = {}
        self.plant_cache: Dict[str, str] = {}

        # Statistics
        self.stats = {
            "archives_removed": 0,
            "blocks_synced": 0,
            "blocks_not_found": [],
            "plants_not_found": [],
            "state_counts": {"planned": 0, "growing": 0, "harvesting": 0},
        }

    async def connect(self):
        """Connect to MongoDB."""
        self.client = AsyncIOMotorClient(MONGO_URI)
        self.db = self.client[DB_NAME]
        print(f"Connected to MongoDB: {MONGO_URI}/{DB_NAME}")
        if self.dry_run:
            print("*** DRY RUN MODE - No changes will be made ***")

    async def close(self):
        """Close MongoDB connection."""
        if self.client:
            self.client.close()

    async def load_blocks_cache(self):
        """Load all blocks into cache for fast lookup."""
        print("Loading blocks cache...")
        cursor = self.db["blocks"].find({}, {"blockId": 1, "name": 1, "farmId": 1, "state": 1})
        count = 0
        async for block in cursor:
            key = f"{block['farmId']}:{block['name']}"
            self.block_cache[key] = {
                "blockId": block["blockId"],
                "name": block["name"],
                "farmId": block["farmId"],
                "currentState": block.get("state", "empty"),
            }
            count += 1
        print(f"  Loaded {count} blocks into cache")

    async def load_plants_cache(self):
        """Load all plants into cache for fast lookup."""
        print("Loading plants cache...")
        cursor = self.db["plant_data_enhanced"].find({}, {"plantDataId": 1, "plantName": 1})
        count = 0
        async for plant in cursor:
            name = plant["plantName"]
            self.plant_cache[name] = plant["plantDataId"]

            # Also store without -Tayeb suffix
            if name.endswith("-Tayeb"):
                base_name = name[:-6]
                self.plant_cache[base_name] = plant["plantDataId"]
            count += 1
        print(f"  Loaded {count} plants into cache")

    def find_block(self, old_code: str, farm_name: str) -> Tuple[Optional[Dict], str]:
        """Find block from old code and farm name."""
        farm_id = FARM_MAPPING.get(farm_name)
        if not farm_id:
            return None, "farm_not_found"

        normalized = normalize_block_code(old_code)
        key = f"{farm_id}:{normalized}"
        block = self.block_cache.get(key)

        if block:
            return block, "matched"

        return None, "not_found"

    def find_plant(self, crop_name: str) -> Tuple[Optional[str], str]:
        """Find plant UUID from crop name."""
        # Try with -Tayeb suffix first
        tayeb_name = f"{crop_name}-Tayeb"
        if tayeb_name in self.plant_cache:
            return self.plant_cache[tayeb_name], "matched"

        # Try exact match
        if crop_name in self.plant_cache:
            return self.plant_cache[crop_name], "matched"

        return None, "not_found"

    async def cleanup_incorrect_archives(self, active_blocks: List[Dict]) -> int:
        """
        Phase 1: Remove archives that match currently active blocks.
        These were incorrectly archived while still being harvested.
        """
        print("\n=== Phase 1: Cleanup Incorrect Archives ===")

        removed = 0
        for record in active_blocks:
            if record.get("state") not in ["Planted", "Harvested"]:
                continue

            block, status = self.find_block(
                record.get("block_id", ""),
                record.get("Name", "")
            )

            if not block:
                continue

            block_id = block["blockId"]
            crop_name = record.get("Item", "")
            time_start = parse_datetime(record.get("time_start"))

            if not time_start:
                continue

            # Find archives for this block that match the current cycle
            query = {
                "blockId": block_id,
                "targetCropName": {"$regex": crop_name, "$options": "i"},
                "plantedDate": {"$gte": time_start - timedelta(days=7)},
            }

            # Count matching archives
            count = await self.db["block_archives"].count_documents(query)

            if count > 0:
                if self.dry_run:
                    print(f"  [DRY RUN] Would remove {count} archives for {record['block_id']} ({crop_name})")
                else:
                    result = await self.db["block_archives"].delete_many(query)
                    print(f"  Removed {result.deleted_count} incorrect archives for {record['block_id']} ({crop_name})")
                    removed += result.deleted_count

        self.stats["archives_removed"] = removed
        print(f"\nTotal archives removed: {removed}")
        return removed

    async def sync_active_blocks(self, active_blocks: List[Dict]) -> int:
        """
        Phase 2: Update blocks with current status from OldData.
        """
        print("\n=== Phase 2: Sync Active Block Status ===")

        synced = 0
        total = len(active_blocks)

        for i, record in enumerate(active_blocks):
            if (i + 1) % 50 == 0:
                print(f"  Progress: {i + 1}/{total}")

            old_state = record.get("state", "")
            new_status = STATE_MAPPING.get(old_state)

            if not new_status:
                continue

            # Find block
            block, block_status = self.find_block(
                record.get("block_id", ""),
                record.get("Name", "")
            )

            if not block:
                self.stats["blocks_not_found"].append({
                    "block_id": record.get("block_id"),
                    "normalized": normalize_block_code(record.get("block_id", "")),
                    "farm": record.get("Name"),
                    "state": old_state,
                })
                continue

            block_id = block["blockId"]
            crop_name = record.get("Item", "")

            # Find plant
            plant_id, plant_status = self.find_plant(crop_name)
            if not plant_id:
                self.stats["plants_not_found"].append({
                    "crop_name": crop_name,
                    "block_id": record.get("block_id"),
                })
                # Still sync but with null targetCrop

            # Parse dates
            time_start = parse_datetime(record.get("time_start"))
            time_finish = parse_datetime(record.get("time_finish"))

            # Calculate predicted yield
            drips = record.get("drips", 0) or 0
            net_yield_per_drip = record.get("NetYieldPerDripkg", 0) or 0
            predicted_yield = drips * net_yield_per_drip

            # Build update data
            update_data = {
                "state": new_status,
                "targetCrop": plant_id,
                "targetCropName": crop_name,
                "actualPlantCount": drips,
                "plantedDate": time_start,
                "expectedHarvestDate": time_finish,
                "updatedAt": datetime.now(timezone.utc),
            }

            # Add KPI if we have predicted yield
            if predicted_yield > 0:
                update_data["kpi"] = {
                    "predictedYieldKg": predicted_yield,
                }

            # Build status change record
            status_change = {
                "status": new_status,
                "changedAt": time_start or datetime.now(timezone.utc),
                "changedBy": SYSTEM_USER_ID,
                "changedByEmail": SYSTEM_USER_EMAIL,
                "notes": f"Synced from OldData. Season {record.get('plannedseason')}, Year {record.get('viewing_year')}",
            }

            if self.dry_run:
                print(f"  [DRY RUN] Would update {record['block_id']} ({crop_name}) -> {new_status}")
            else:
                # Update the block
                result = await self.db["blocks"].update_one(
                    {"blockId": block_id},
                    {
                        "$set": update_data,
                        "$push": {"statusChanges": status_change},
                    }
                )

                if result.modified_count > 0:
                    synced += 1
                    self.stats["state_counts"][new_status] += 1

        self.stats["blocks_synced"] = synced
        print(f"\nTotal blocks synced: {synced}")
        return synced

    async def verify_results(self):
        """Phase 3: Verify the sync results."""
        print("\n=== Phase 3: Verification ===")

        # Count blocks by state
        pipeline = [
            {"$group": {"_id": "$state", "count": {"$sum": 1}}}
        ]
        result = await self.db["blocks"].aggregate(pipeline).to_list(None)
        state_counts = {r["_id"]: r["count"] for r in result}

        print("\nBlock states in database:")
        for state, count in sorted(state_counts.items()):
            print(f"  {state}: {count}")

        # Count archives
        archive_count = await self.db["block_archives"].count_documents({})
        print(f"\nTotal archives: {archive_count}")

        # Count harvesting blocks with harvests
        harvesting_with_harvests = await self.db["blocks"].count_documents({
            "state": "harvesting",
        })
        print(f"Blocks in harvesting state: {harvesting_with_harvests}")

    def print_summary(self):
        """Print summary of sync operation."""
        print("\n" + "=" * 60)
        print("SYNC SUMMARY")
        print("=" * 60)

        print(f"\nArchives removed: {self.stats['archives_removed']}")
        print(f"Blocks synced: {self.stats['blocks_synced']}")
        print(f"  - PLANNED: {self.stats['state_counts']['planned']}")
        print(f"  - GROWING: {self.stats['state_counts']['growing']}")
        print(f"  - HARVESTING: {self.stats['state_counts']['harvesting']}")

        if self.stats["blocks_not_found"]:
            print(f"\nBlocks not found: {len(self.stats['blocks_not_found'])}")
            # Show first 5
            for b in self.stats["blocks_not_found"][:5]:
                print(f"  - {b['block_id']} ({b['farm']}) -> normalized: {b['normalized']}")
            if len(self.stats["blocks_not_found"]) > 5:
                print(f"  ... and {len(self.stats['blocks_not_found']) - 5} more")

        if self.stats["plants_not_found"]:
            unique_crops = set(p["crop_name"] for p in self.stats["plants_not_found"])
            print(f"\nCrops not found in plant_data_enhanced: {len(unique_crops)}")
            for crop in list(unique_crops)[:5]:
                print(f"  - {crop} (searched as {crop}-Tayeb)")

        if self.dry_run:
            print("\n*** This was a DRY RUN - no changes were made ***")


async def main():
    parser = argparse.ArgumentParser(description="Sync active blocks from OldData to MongoDB")
    parser.add_argument("--dry-run", action="store_true", help="Preview changes without modifying database")
    args = parser.parse_args()

    print("=" * 60)
    print("ACTIVE BLOCK STATUS SYNC")
    print("=" * 60)

    sync = ActiveBlockSync(dry_run=args.dry_run)

    try:
        await sync.connect()

        # Load caches
        await sync.load_blocks_cache()
        await sync.load_plants_cache()

        # Load source data
        print("\nLoading source data...")
        data_paths = [
            "/app/farm_block_comp.json",
            "/app/OldData/json_exports/farm_block_comp.json",
            "OldData/json_exports/farm_block_comp.json",
        ]

        active_blocks = None
        for path in data_paths:
            try:
                with open(path, "r") as f:
                    active_blocks = json.load(f)
                print(f"  Loaded farm_block_comp.json from {path}: {len(active_blocks)} records")
                break
            except FileNotFoundError:
                continue

        if active_blocks is None:
            raise FileNotFoundError(f"Could not find farm_block_comp.json in any of: {data_paths}")

        # Count by state
        state_counts = {}
        for r in active_blocks:
            state = r.get("state", "unknown")
            state_counts[state] = state_counts.get(state, 0) + 1
        print(f"  States: {state_counts}")

        # Phase 1: Cleanup incorrect archives
        await sync.cleanup_incorrect_archives(active_blocks)

        # Phase 2: Sync active block status
        await sync.sync_active_blocks(active_blocks)

        # Phase 3: Verify results
        await sync.verify_results()

        # Print summary
        sync.print_summary()

    finally:
        await sync.close()


if __name__ == "__main__":
    asyncio.run(main())
