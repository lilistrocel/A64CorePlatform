#!/usr/bin/env python3
"""
Update Block Actual Yields Script

Calculates and updates actualYieldKg for blocks in harvesting state
by summing harvests within the current planting cycle's timeframe.

IMPORTANT: Only harvests between plantedDate and expectedHarvestDate (or now)
are counted toward the current cycle's actual yield.

Data Flow:
1. Query blocks with state='harvesting'
2. For each block, get plantedDate and expectedHarvestDate
3. Sum block_harvests where harvestDate is within that range
4. Update kpi.actualYieldKg, kpi.totalHarvests, kpi.yieldEfficiencyPercent
"""

import asyncio
import argparse
from datetime import datetime, timezone
from typing import Dict, List, Optional
from motor.motor_asyncio import AsyncIOMotorClient

# MongoDB Connection
MONGO_URI = "mongodb://mongodb:27017"
DB_NAME = "a64core_db"


class BlockYieldUpdater:
    def __init__(self, dry_run: bool = False, all_active: bool = False):
        self.client = None
        self.db = None
        self.dry_run = dry_run
        self.all_active = all_active  # Include 'growing' blocks too

        # Statistics
        self.stats = {
            "blocks_processed": 0,
            "blocks_updated": 0,
            "blocks_skipped": 0,
            "total_yield_added": 0.0,
            "total_harvests_counted": 0,
            "blocks_with_issues": [],
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

    async def get_harvesting_blocks(self) -> List[Dict]:
        """Get all blocks in harvesting (and optionally growing) state."""
        states = ["harvesting"]
        if self.all_active:
            states.extend(["growing", "fruiting"])

        query = {
            "state": {"$in": states},
            "isActive": True,
        }

        cursor = self.db["blocks"].find(query)
        blocks = await cursor.to_list(None)

        print(f"\nFound {len(blocks)} blocks in {states} state(s)")
        return blocks

    async def calculate_cycle_yield(
        self,
        block_id: str,
        planted_date: Optional[datetime],
        expected_harvest_date: Optional[datetime]
    ) -> Dict:
        """
        Calculate total yield and harvest count for the current cycle.

        Only includes harvests where harvestDate is:
        - >= plantedDate (start of cycle)
        - <= expectedHarvestDate or now (whichever is later)
        """
        if not planted_date:
            return {"total_kg": 0, "harvest_count": 0, "quality_breakdown": {}}

        # Ensure planted_date is timezone-aware
        if planted_date.tzinfo is None:
            planted_date = planted_date.replace(tzinfo=timezone.utc)

        # End date is the later of expectedHarvestDate or now
        now = datetime.now(timezone.utc)
        end_date = expected_harvest_date if expected_harvest_date else now

        # Ensure end_date is timezone-aware
        if end_date.tzinfo is None:
            end_date = end_date.replace(tzinfo=timezone.utc)

        if end_date < now:
            end_date = now  # Include recent harvests even if past expected date

        # Build aggregation pipeline
        pipeline = [
            {
                "$match": {
                    "blockId": block_id,
                    "harvestDate": {
                        "$gte": planted_date,
                        "$lte": end_date
                    }
                }
            },
            {
                "$group": {
                    "_id": None,
                    "totalQuantityKg": {"$sum": "$quantityKg"},
                    "harvestCount": {"$sum": 1},
                    "qualityAKg": {
                        "$sum": {
                            "$cond": [{"$eq": ["$qualityGrade", "A"]}, "$quantityKg", 0]
                        }
                    },
                    "qualityBKg": {
                        "$sum": {
                            "$cond": [{"$eq": ["$qualityGrade", "B"]}, "$quantityKg", 0]
                        }
                    },
                    "qualityCKg": {
                        "$sum": {
                            "$cond": [{"$eq": ["$qualityGrade", "C"]}, "$quantityKg", 0]
                        }
                    },
                }
            }
        ]

        result = await self.db["block_harvests"].aggregate(pipeline).to_list(None)

        if not result:
            return {"total_kg": 0, "harvest_count": 0, "quality_breakdown": {}}

        data = result[0]
        return {
            "total_kg": data.get("totalQuantityKg", 0) or 0,
            "harvest_count": data.get("harvestCount", 0) or 0,
            "quality_breakdown": {
                "A": data.get("qualityAKg", 0) or 0,
                "B": data.get("qualityBKg", 0) or 0,
                "C": data.get("qualityCKg", 0) or 0,
            }
        }

    async def update_block_kpis(self):
        """Main method to update all harvesting blocks."""
        blocks = await self.get_harvesting_blocks()

        for block in blocks:
            block_id = block.get("blockId")
            block_code = block.get("blockCode") or block.get("name") or block_id[:8]
            state = block.get("state")
            planted_date = block.get("plantedDate")
            expected_harvest_date = block.get("expectedHarvestDate")

            # Get current KPI
            current_kpi = block.get("kpi", {})
            predicted_yield = current_kpi.get("predictedYieldKg", 0) or 0
            current_actual = current_kpi.get("actualYieldKg", 0) or 0

            self.stats["blocks_processed"] += 1

            # Skip if no planted date
            if not planted_date:
                self.stats["blocks_skipped"] += 1
                self.stats["blocks_with_issues"].append({
                    "block_code": block_code,
                    "issue": "No plantedDate set"
                })
                continue

            # Calculate yield from harvests in current cycle
            yield_data = await self.calculate_cycle_yield(
                block_id,
                planted_date,
                expected_harvest_date
            )

            new_actual = yield_data["total_kg"]
            harvest_count = yield_data["harvest_count"]

            # Calculate efficiency
            if predicted_yield > 0:
                efficiency = (new_actual / predicted_yield) * 100
            else:
                efficiency = 0

            # Determine if update is needed
            needs_update = (
                abs(new_actual - current_actual) > 0.01 or  # Yield changed
                current_kpi.get("totalHarvests", 0) != harvest_count  # Count changed
            )

            if not needs_update:
                print(f"  [{block_code}] No change needed (actual: {new_actual:.1f}kg, {harvest_count} harvests)")
                continue

            # Log the change
            print(f"  [{block_code}] {state.upper()}")
            print(f"    Planted: {planted_date.strftime('%Y-%m-%d') if planted_date else 'N/A'}")
            print(f"    Expected Harvest: {expected_harvest_date.strftime('%Y-%m-%d') if expected_harvest_date else 'N/A'}")
            print(f"    Harvests in cycle: {harvest_count}")
            print(f"    Actual yield: {current_actual:.1f} -> {new_actual:.1f} kg")
            print(f"    Predicted yield: {predicted_yield:.1f} kg")
            print(f"    Efficiency: {efficiency:.1f}%")

            if self.dry_run:
                print(f"    [DRY RUN] Would update KPIs")
            else:
                # Update block KPIs
                result = await self.db["blocks"].update_one(
                    {"blockId": block_id},
                    {
                        "$set": {
                            "kpi.actualYieldKg": new_actual,
                            "kpi.totalHarvests": harvest_count,
                            "kpi.yieldEfficiencyPercent": efficiency,
                            "updatedAt": datetime.now(timezone.utc)
                        }
                    }
                )

                if result.modified_count > 0:
                    self.stats["blocks_updated"] += 1
                    self.stats["total_yield_added"] += (new_actual - current_actual)
                    self.stats["total_harvests_counted"] += harvest_count
                    print(f"    ✓ Updated successfully")
                else:
                    print(f"    ✗ Update failed (no documents modified)")

    async def verify_results(self):
        """Verify the update results."""
        print("\n=== Verification ===")

        # Count blocks by state with non-zero actual yield
        pipeline = [
            {"$match": {"state": "harvesting", "isActive": True}},
            {
                "$group": {
                    "_id": None,
                    "total": {"$sum": 1},
                    "with_yield": {
                        "$sum": {"$cond": [{"$gt": ["$kpi.actualYieldKg", 0]}, 1, 0]}
                    },
                    "total_actual_yield": {"$sum": "$kpi.actualYieldKg"},
                    "total_predicted_yield": {"$sum": "$kpi.predictedYieldKg"},
                }
            }
        ]

        result = await self.db["blocks"].aggregate(pipeline).to_list(None)

        if result:
            data = result[0]
            print(f"\nHarvesting blocks:")
            print(f"  Total: {data.get('total', 0)}")
            print(f"  With yield > 0: {data.get('with_yield', 0)}")
            print(f"  Total actual yield: {data.get('total_actual_yield', 0):.1f} kg")
            print(f"  Total predicted yield: {data.get('total_predicted_yield', 0):.1f} kg")

    def print_summary(self):
        """Print summary of update operation."""
        print("\n" + "=" * 60)
        print("UPDATE SUMMARY")
        print("=" * 60)

        print(f"\nBlocks processed: {self.stats['blocks_processed']}")
        print(f"Blocks updated: {self.stats['blocks_updated']}")
        print(f"Blocks skipped: {self.stats['blocks_skipped']}")
        print(f"Total yield added: {self.stats['total_yield_added']:.1f} kg")
        print(f"Total harvests counted: {self.stats['total_harvests_counted']}")

        if self.stats["blocks_with_issues"]:
            print(f"\nBlocks with issues: {len(self.stats['blocks_with_issues'])}")
            for issue in self.stats["blocks_with_issues"][:5]:
                print(f"  - {issue['block_code']}: {issue['issue']}")

        if self.dry_run:
            print("\n*** This was a DRY RUN - no changes were made ***")


async def main():
    parser = argparse.ArgumentParser(
        description="Update block actualYieldKg from harvests in current cycle"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview changes without modifying database"
    )
    parser.add_argument(
        "--all-active",
        action="store_true",
        help="Include growing and fruiting blocks, not just harvesting"
    )
    args = parser.parse_args()

    print("=" * 60)
    print("UPDATE BLOCK ACTUAL YIELDS FROM HARVESTS")
    print("=" * 60)

    updater = BlockYieldUpdater(dry_run=args.dry_run, all_active=args.all_active)

    try:
        await updater.connect()

        # Update block KPIs
        await updater.update_block_kpis()

        # Verify results
        await updater.verify_results()

        # Print summary
        updater.print_summary()

    finally:
        await updater.close()


if __name__ == "__main__":
    asyncio.run(main())
