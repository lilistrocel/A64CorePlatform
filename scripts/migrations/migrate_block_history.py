#!/usr/bin/env python3
"""
Block History Migration Script

Migrates historical planting cycles and harvest records from OldData to MongoDB.
Target: Remote database only.

Data Sources:
- OldData/json_exports/block_history_comp.json (884 records)
- OldData/json_exports/harvest_reports.json (10,079 records)

Target Collections:
- block_archives
- block_harvests
"""

import json
import re
import asyncio
from datetime import datetime, timezone
from typing import Optional, Dict, List, Tuple, Any
from uuid import UUID
from motor.motor_asyncio import AsyncIOMotorClient

# MongoDB Connection
MONGO_URI = "mongodb://mongodb:27017"
DB_NAME = "a64core_db"

# System user for migration records
SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001"
SYSTEM_USER_EMAIL = "migration@a64platform.com"

# ============================================================================
# FARM MAPPING (from remote database)
# ============================================================================
FARM_MAPPING = {
    "Al Ain": "cd22c152-defa-47fa-88af-0b3b422b5700",
    "Al Ain Farm": "cd22c152-defa-47fa-88af-0b3b422b5700",  # Alias
    "Al Khazana": "39d0cdd6-6519-46c9-96f8-966298e2199f",
    "Silal Upgrade Farm": "e743061e-68ac-4fcc-8bee-8a26de2e975e",
    "Al Wagen": "8af274db-99e3-417b-a871-e593647698a1",
    "Liwa": "1caa75cb-e23f-4d76-9c89-0154216a3e12",
    "New Hydroponics": "c3b5b397-5973-4414-a772-c889b131b59f",
}

# ============================================================================
# FARM TYPE MAPPING
# ============================================================================
FARM_TYPE_MAP = {
    "Open Field": "openfield",
    "Green House": "greenhouse",
    "Net House": "nethouse",
    "Hydroponic": "hydroponic",
    "Aeroponic": "aeroponic",
    "Container Farm": "containerfarm",
}


def normalize_block_code(old_code: str) -> str:
    """
    Normalize old block codes to match our database block names.

    Examples:
        A-01-001 → A01
        A-43-1 → A43
        LW-54 → LW54
        AG-06-001 → AG06
        KHZ-34-1 → KHZ34
        WG-04-1 → WG04
        S.NH 720 - 16457-004 → SNH720 (special case)
    """
    code = old_code.strip()

    # Special case: S.NH format
    if code.startswith("S.NH"):
        # S.NH 720 - 16457-004 → SNH720
        match = re.match(r"S\.NH\s*(\d+)", code)
        if match:
            return f"SNH{match.group(1)}"

    # Remove season suffix (-001, -002, -1, etc.)
    # Pattern: Remove trailing -\d+ at the end
    code = re.sub(r"-\d{1,3}$", "", code)

    # Remove hyphens between letters and numbers
    # A-01 → A01, LW-54 → LW54, KHZ-34 → KHZ34
    code = re.sub(r"([A-Za-z]+)-(\d+)", r"\1\2", code)

    # Remove any remaining hyphens
    code = code.replace("-", "")

    # Remove leading zeros from numbers
    # A01 stays A01, but ensure consistent formatting
    match = re.match(r"([A-Za-z]+)(\d+)", code)
    if match:
        prefix = match.group(1)
        number = int(match.group(2))
        # Format with leading zero only if single digit
        return f"{prefix}{number:02d}" if number < 10 else f"{prefix}{number}"

    return code


def parse_datetime(dt_string: Optional[str]) -> Optional[datetime]:
    """Parse datetime string from old data."""
    if not dt_string:
        return None
    try:
        # Handle various formats
        if dt_string.endswith("+00:00") or dt_string.endswith("Z"):
            dt_string = dt_string.replace("Z", "+00:00")
            return datetime.fromisoformat(dt_string)
        return datetime.fromisoformat(dt_string)
    except Exception:
        return None


class BlockHistoryMigration:
    def __init__(self):
        self.client = None
        self.db = None

        # Caches (populated during initialization)
        self.block_cache: Dict[str, Dict] = {}  # key: f"{farmId}:{normalizedName}"
        self.plant_cache: Dict[str, str] = {}   # key: crop_name, value: plantDataId

        # Statistics
        self.stats = {
            "archives_created": 0,
            "archives_skipped": 0,
            "harvests_created": 0,
            "harvests_skipped": 0,
            "unmapped_blocks": [],
            "unmapped_crops": [],
        }

    async def connect(self):
        """Connect to MongoDB."""
        self.client = AsyncIOMotorClient(MONGO_URI)
        self.db = self.client[DB_NAME]
        print(f"Connected to MongoDB: {MONGO_URI}/{DB_NAME}")

    async def close(self):
        """Close MongoDB connection."""
        if self.client:
            self.client.close()

    async def load_blocks_cache(self):
        """Load all blocks into cache for fast lookup."""
        print("Loading blocks cache...")
        cursor = self.db["blocks"].find({}, {"blockId": 1, "name": 1, "farmId": 1})
        count = 0
        async for block in cursor:
            key = f"{block['farmId']}:{block['name']}"
            self.block_cache[key] = {
                "blockId": block["blockId"],
                "name": block["name"],
                "farmId": block["farmId"],
            }
            count += 1
        print(f"  Loaded {count} blocks into cache")

    async def load_plants_cache(self):
        """Load all plants into cache for fast lookup."""
        print("Loading plants cache...")
        cursor = self.db["plant_data_enhanced"].find({}, {"plantDataId": 1, "plantName": 1})
        count = 0
        async for plant in cursor:
            # Store by normalized name (for matching)
            name = plant["plantName"]
            self.plant_cache[name] = plant["plantDataId"]

            # Also store without -Tayeb suffix for easier matching
            if name.endswith("-Tayeb"):
                base_name = name[:-6]  # Remove "-Tayeb"
                self.plant_cache[base_name] = plant["plantDataId"]
            count += 1
        print(f"  Loaded {count} plants into cache")

    def find_block(self, old_code: str, farm_name: str) -> Tuple[Optional[str], str]:
        """
        Find block UUID from old code and farm name.

        Returns: (blockId or None, status: 'matched'|'not_found')
        """
        farm_id = FARM_MAPPING.get(farm_name)
        if not farm_id:
            return None, "farm_not_found"

        # Normalize the old code
        normalized = normalize_block_code(old_code)

        # Look up in cache
        key = f"{farm_id}:{normalized}"
        block = self.block_cache.get(key)

        if block:
            return block["blockId"], "matched"

        return None, "not_found"

    def find_plant(self, crop_name: str) -> Tuple[Optional[str], str]:
        """
        Find plant UUID from crop name.

        Strategy:
        1. Try exact match with "-Tayeb" suffix
        2. Try exact match without suffix
        3. Return None if not found
        """
        # Try with -Tayeb suffix first
        tayeb_name = f"{crop_name}-Tayeb"
        if tayeb_name in self.plant_cache:
            return self.plant_cache[tayeb_name], "matched"

        # Try exact match
        if crop_name in self.plant_cache:
            return self.plant_cache[crop_name], "matched"

        return None, "not_found"

    async def migrate_block_archives(self, history_data: List[Dict]) -> int:
        """Migrate block history records to block_archives collection."""
        print(f"\nMigrating {len(history_data)} block archives...")

        # Count harvests per block for summary
        harvest_counts = await self._count_harvests_per_block()

        created = 0
        for i, record in enumerate(history_data):
            if (i + 1) % 100 == 0:
                print(f"  Progress: {i + 1}/{len(history_data)}")

            # Find block
            block_id, block_status = self.find_block(
                record.get("block_id", ""),
                record.get("farm_id", "")
            )

            if not block_id:
                self.stats["unmapped_blocks"].append({
                    "old_code": record.get("block_id"),
                    "normalized": normalize_block_code(record.get("block_id", "")),
                    "farm": record.get("farm_id"),
                    "ref": record.get("ref"),
                })
                self.stats["archives_skipped"] += 1
                continue

            # Find plant
            plant_id, plant_status = self.find_plant(record.get("crop_id", ""))
            if not plant_id:
                self.stats["unmapped_crops"].append({
                    "crop_name": record.get("crop_id"),
                    "searched_as": f"{record.get('crop_id')}-Tayeb",
                    "ref": record.get("ref"),
                })
                # Still create archive but with null targetCrop

            # Parse dates
            time_start = parse_datetime(record.get("time_start"))
            time_finish = parse_datetime(record.get("time_finish"))
            time_cleaned = parse_datetime(record.get("time_cleaned"))

            # Calculate cycle duration
            cycle_days = 0
            if time_start and time_finish:
                cycle_days = (time_finish - time_start).days

            # Get harvest count for this block/season
            harvest_key = f"{record.get('block_id')}:{record.get('plannedseason')}"
            total_harvests = harvest_counts.get(harvest_key, 0)

            # Map farm type
            farm_type = FARM_TYPE_MAP.get(record.get("farm_type", ""), "openfield")

            # Actual yield
            actual_yield = record.get("harvest_data", 0) or 0

            # Build archive document
            archive_doc = {
                "archiveId": record.get("ref"),  # Preserve old UUID
                "blockId": block_id,
                "blockCode": record.get("block_id"),  # Keep original code
                "farmId": FARM_MAPPING.get(record.get("farm_id")),
                "farmName": record.get("farm_id"),

                # Block snapshot
                "blockType": farm_type,
                "maxPlants": record.get("drips", 0) or 0,
                "actualPlantCount": record.get("drips", 0) or 0,
                "area": record.get("area", 0) or 0,
                "areaUnit": "sqm",
                "location": None,

                # Crop info
                "targetCrop": plant_id,
                "targetCropName": record.get("crop_id"),

                # Cycle timing
                "plantedDate": time_start,
                "harvestCompletedDate": time_finish,
                "cycleDurationDays": max(cycle_days, 1),

                # Yield KPIs
                "predictedYieldKg": record.get("predicted_yield", 0) or 0,
                "actualYieldKg": actual_yield,
                "yieldEfficiencyPercent": (record.get("kpi", 0) or 0) * 100,
                "totalHarvests": total_harvests,

                # Quality breakdown (default to B grade)
                "qualityBreakdown": {
                    "qualityAKg": 0,
                    "qualityBKg": actual_yield,  # All as B grade
                    "qualityCKg": 0,
                },

                # Status timeline (reconstructed)
                "statusChanges": self._build_status_timeline(record, time_start, time_finish, time_cleaned),

                # Alerts summary (empty)
                "alertsSummary": {
                    "totalAlerts": 0,
                    "resolvedAlerts": 0,
                    "averageResolutionTimeHours": None,
                },

                # Archive metadata
                "archivedAt": time_cleaned or datetime.now(timezone.utc),
                "archivedBy": SYSTEM_USER_ID,
                "archivedByEmail": SYSTEM_USER_EMAIL,

                # Extra metadata from old system
                "metadata": {
                    "migratedFrom": "legacy_block_history",
                    "migratedAt": datetime.now(timezone.utc).isoformat(),
                    "oldRef": record.get("ref"),
                    "oldFarmBlockRef": record.get("farm_block_ref"),
                    "plannedSeason": record.get("plannedseason"),
                    "viewingYear": record.get("viewing_year"),
                    "sowingDurationDays": record.get("SowingDurationday"),
                    "harvestDurationDays": record.get("HarvestDurationday"),
                    "seedsPerDrip": record.get("seedsPerDrip"),
                    "netYieldPerDripKg": record.get("NetYieldPerDripkg"),
                },
            }

            # Check for duplicate
            existing = await self.db["block_archives"].find_one({"archiveId": record.get("ref")})
            if existing:
                self.stats["archives_skipped"] += 1
                continue

            # Insert
            await self.db["block_archives"].insert_one(archive_doc)
            created += 1
            self.stats["archives_created"] += 1

        return created

    def _build_status_timeline(
        self, record: Dict, time_start: datetime, time_finish: datetime, time_cleaned: datetime
    ) -> List[Dict]:
        """Build status timeline from dates."""
        timeline = []

        if time_start:
            timeline.append({
                "status": "planted",
                "changedAt": time_start,
                "changedBy": SYSTEM_USER_ID,
                "changedByEmail": SYSTEM_USER_EMAIL,
                "notes": f"Migrated from legacy system. Season {record.get('plannedseason')}",
            })

        if time_finish:
            timeline.append({
                "status": "harvesting",
                "changedAt": time_finish,
                "changedBy": SYSTEM_USER_ID,
                "changedByEmail": SYSTEM_USER_EMAIL,
                "notes": "Harvest period ended",
            })

        if time_cleaned:
            timeline.append({
                "status": "empty",
                "changedAt": time_cleaned,
                "changedBy": SYSTEM_USER_ID,
                "changedByEmail": SYSTEM_USER_EMAIL,
                "notes": "Block cleaned and reset",
            })

        return timeline

    async def _count_harvests_per_block(self) -> Dict[str, int]:
        """Count harvest records per block/season from harvest_reports."""
        print("Counting harvests per block...")

        # Load harvest reports from flexible paths
        harvest_paths = ["/app/harvest_reports.json", "/app/OldData/json_exports/harvest_reports.json", "OldData/json_exports/harvest_reports.json"]
        harvests = None
        for path in harvest_paths:
            try:
                with open(path, "r") as f:
                    harvests = json.load(f)
                break
            except FileNotFoundError:
                continue
        if harvests is None:
            print("Warning: Could not load harvest_reports.json, skipping harvest counts")
            return {}

        counts = {}
        for h in harvests:
            key = f"{h.get('block_id')}:{h.get('harvestSeason')}"
            counts[key] = counts.get(key, 0) + 1

        print(f"  Found harvests for {len(counts)} block/season combinations")
        return counts

    async def migrate_block_harvests(self, harvest_data: List[Dict]) -> int:
        """Migrate harvest reports to block_harvests collection."""
        print(f"\nMigrating {len(harvest_data)} harvest records...")

        created = 0
        batch = []
        batch_size = 500

        for i, record in enumerate(harvest_data):
            if (i + 1) % 1000 == 0:
                print(f"  Progress: {i + 1}/{len(harvest_data)}")

            # Find block - need to normalize the block_id
            block_id, block_status = self.find_block(
                record.get("block_id", ""),
                record.get("farm", "")
            )

            if not block_id:
                self.stats["harvests_skipped"] += 1
                continue

            # Parse date
            harvest_date = parse_datetime(record.get("time"))
            if not harvest_date:
                self.stats["harvests_skipped"] += 1
                continue

            # Build harvest document
            harvest_doc = {
                "harvestId": record.get("ref"),  # Preserve old UUID
                "blockId": block_id,
                "farmId": FARM_MAPPING.get(record.get("farm")),

                "harvestDate": harvest_date,
                "quantityKg": record.get("Quantity", 0) or 0,
                "qualityGrade": "B",  # Default per user decision
                "notes": f"Migrated from legacy system. Season {record.get('harvestSeason')}",

                "recordedBy": SYSTEM_USER_ID,
                "recordedByEmail": record.get("reporter_user") or SYSTEM_USER_EMAIL,
                "createdAt": harvest_date,

                # Extra metadata
                "metadata": {
                    "migratedFrom": "legacy_harvest_reports",
                    "migratedAt": datetime.now(timezone.utc).isoformat(),
                    "oldRef": record.get("ref"),
                    "oldFarmBlockRef": record.get("farm_block_ref"),
                    "harvestSeason": record.get("harvestSeason"),
                    "viewingYear": record.get("viewing_year"),
                    "crop": record.get("crop"),
                    "mainBlock": record.get("main_block"),
                },
            }

            batch.append(harvest_doc)

            # Insert in batches
            if len(batch) >= batch_size:
                # Check for duplicates
                refs = [d["harvestId"] for d in batch]
                existing = await self.db["block_harvests"].find(
                    {"harvestId": {"$in": refs}},
                    {"harvestId": 1}
                ).to_list(length=batch_size)
                existing_refs = set(d["harvestId"] for d in existing)

                new_docs = [d for d in batch if d["harvestId"] not in existing_refs]
                if new_docs:
                    await self.db["block_harvests"].insert_many(new_docs)
                    created += len(new_docs)
                    self.stats["harvests_created"] += len(new_docs)

                self.stats["harvests_skipped"] += len(batch) - len(new_docs)
                batch = []

        # Insert remaining
        if batch:
            refs = [d["harvestId"] for d in batch]
            existing = await self.db["block_harvests"].find(
                {"harvestId": {"$in": refs}},
                {"harvestId": 1}
            ).to_list(length=len(batch))
            existing_refs = set(d["harvestId"] for d in existing)

            new_docs = [d for d in batch if d["harvestId"] not in existing_refs]
            if new_docs:
                await self.db["block_harvests"].insert_many(new_docs)
                created += len(new_docs)
                self.stats["harvests_created"] += len(new_docs)

            self.stats["harvests_skipped"] += len(batch) - len(new_docs)

        return created

    def save_reports(self):
        """Save unmapped records reports."""
        # Deduplicate unmapped blocks
        seen_blocks = set()
        unique_unmapped_blocks = []
        for b in self.stats["unmapped_blocks"]:
            key = f"{b['old_code']}:{b['farm']}"
            if key not in seen_blocks:
                seen_blocks.add(key)
                unique_unmapped_blocks.append(b)

        # Save unmapped blocks report
        report = {
            "unmapped_blocks": unique_unmapped_blocks,
            "summary": {
                "total_history_records": self.stats["archives_created"] + self.stats["archives_skipped"],
                "archives_created": self.stats["archives_created"],
                "archives_skipped": self.stats["archives_skipped"],
                "unique_unmapped_blocks": len(unique_unmapped_blocks),
            },
        }
        with open("/app/unmapped_blocks.json", "w") as f:
            json.dump(report, f, indent=2, default=str)
        print(f"\nSaved unmapped_blocks.json ({len(unique_unmapped_blocks)} unique blocks)")

        # Deduplicate unmapped crops
        seen_crops = set()
        unique_unmapped_crops = []
        for c in self.stats["unmapped_crops"]:
            if c["crop_name"] not in seen_crops:
                seen_crops.add(c["crop_name"])
                unique_unmapped_crops.append(c)

        # Save unmapped crops report
        crops_report = {
            "unmapped_crops": unique_unmapped_crops,
            "summary": {
                "unique_unmapped_crops": len(unique_unmapped_crops),
            },
        }
        with open("/app/unmapped_crops.json", "w") as f:
            json.dump(crops_report, f, indent=2, default=str)
        print(f"Saved unmapped_crops.json ({len(unique_unmapped_crops)} unique crops)")

        # Save full summary
        summary = {
            "migration_date": datetime.now(timezone.utc).isoformat(),
            "archives": {
                "created": self.stats["archives_created"],
                "skipped": self.stats["archives_skipped"],
            },
            "harvests": {
                "created": self.stats["harvests_created"],
                "skipped": self.stats["harvests_skipped"],
            },
            "unmapped": {
                "blocks": len(unique_unmapped_blocks),
                "crops": len(unique_unmapped_crops),
            },
        }
        with open("/app/migration_summary.json", "w") as f:
            json.dump(summary, f, indent=2)
        print(f"Saved migration_summary.json")


async def main():
    print("=" * 60)
    print("BLOCK HISTORY MIGRATION")
    print("=" * 60)

    migration = BlockHistoryMigration()

    try:
        await migration.connect()

        # Load caches
        await migration.load_blocks_cache()
        await migration.load_plants_cache()

        # Load source data
        print("\nLoading source data...")
        # Try multiple paths for flexibility
        history_paths = ["/app/block_history_comp.json", "/app/OldData/json_exports/block_history_comp.json", "OldData/json_exports/block_history_comp.json"]
        harvest_paths = ["/app/harvest_reports.json", "/app/OldData/json_exports/harvest_reports.json", "OldData/json_exports/harvest_reports.json"]

        history_data = None
        for path in history_paths:
            try:
                with open(path, "r") as f:
                    history_data = json.load(f)
                print(f"  Loaded block_history_comp.json from {path}: {len(history_data)} records")
                break
            except FileNotFoundError:
                continue
        if history_data is None:
            raise FileNotFoundError(f"Could not find block_history_comp.json in any of: {history_paths}")

        harvest_data = None
        for path in harvest_paths:
            try:
                with open(path, "r") as f:
                    harvest_data = json.load(f)
                print(f"  Loaded harvest_reports.json from {path}: {len(harvest_data)} records")
                break
            except FileNotFoundError:
                continue
        if harvest_data is None:
            raise FileNotFoundError(f"Could not find harvest_reports.json in any of: {harvest_paths}")

        # Migrate archives
        archives_created = await migration.migrate_block_archives(history_data)
        print(f"\nArchives created: {archives_created}")

        # Migrate harvests
        harvests_created = await migration.migrate_block_harvests(harvest_data)
        print(f"Harvests created: {harvests_created}")

        # Save reports
        migration.save_reports()

        print("\n" + "=" * 60)
        print("MIGRATION COMPLETE")
        print("=" * 60)
        print(f"Block Archives: {migration.stats['archives_created']} created, {migration.stats['archives_skipped']} skipped")
        print(f"Block Harvests: {migration.stats['harvests_created']} created, {migration.stats['harvests_skipped']} skipped")
        print(f"\nReview /app/unmapped_blocks.json for manual decisions.")

    finally:
        await migration.close()


if __name__ == "__main__":
    asyncio.run(main())
