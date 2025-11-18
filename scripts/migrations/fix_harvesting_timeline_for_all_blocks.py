"""
Migration: Fix Missing Harvesting Timeline for All Blocks

PROBLEM:
- Blocks with crops that have floweringDays=0 (leafy greens) are missing
  the "harvesting" key in their expectedStatusChanges
- This causes "days until next transition" to not display on dashboard
- Affects lettuce, spinach, kale, and other non-flowering crops

ROOT CAUSE:
- Original timeline calculation in block_service_new.py line 91 requires
  floweringDays to exist AND be > 0
- For leafy greens with floweringDays=0, the harvesting date was never calculated

SOLUTION:
- Recalculate expectedStatusChanges for all active blocks
- Handle crops with or without flowering phase
- Only update blocks that are missing the "harvesting" key

SAFE TO RUN MULTIPLE TIMES:
- Script checks if "harvesting" key exists before updating
- Only modifies blocks that need fixing
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timedelta
from typing import Dict, Optional

MONGO_URI = "mongodb://localhost:27017"
DB_NAME = "a64core_db"


async def calculate_expected_timeline(
    planting_date: datetime,
    growth_cycle: Dict
) -> Dict[str, datetime]:
    """
    Calculate complete expectedStatusChanges including harvesting phase

    Handles crops with or without flowering phase (floweringDays can be 0)
    """
    expected_dates = {}

    # Planted date
    expected_dates["planted"] = planting_date

    # Growing phase (after germination)
    if growth_cycle.get('germinationDays') is not None:
        expected_dates["growing"] = planting_date + timedelta(
            days=growth_cycle['germinationDays']
        )

    # Fruiting phase (after vegetative)
    if (growth_cycle.get('germinationDays') is not None and
        growth_cycle.get('vegetativeDays') is not None):
        expected_dates["fruiting"] = planting_date + timedelta(
            days=growth_cycle['germinationDays'] + growth_cycle['vegetativeDays']
        )

    # Harvesting phase (after flowering OR directly after fruiting for leafy greens)
    if (growth_cycle.get('germinationDays') is not None and
        growth_cycle.get('vegetativeDays') is not None):

        # Calculate days until harvest starts
        days_until_harvest = (
            growth_cycle['germinationDays'] +
            growth_cycle['vegetativeDays']
        )

        # Add flowering days if present (can be 0 for leafy greens)
        if growth_cycle.get('floweringDays') is not None:
            days_until_harvest += growth_cycle['floweringDays']

        expected_dates["harvesting"] = planting_date + timedelta(days=days_until_harvest)

    # Cleaning phase (after total cycle)
    if growth_cycle.get('totalCycleDays') is not None:
        expected_dates["cleaning"] = planting_date + timedelta(
            days=growth_cycle['totalCycleDays']
        )

    return expected_dates


async def fix_block_timeline(
    block: Dict,
    plant_data: Optional[Dict],
    blocks_collection,
    dry_run: bool = False
) -> Dict:
    """
    Fix a single block's timeline

    Returns:
        Dict with status: 'fixed', 'skipped', or 'error'
    """
    block_code = block.get('blockCode', str(block['_id']))

    # Check if block needs fixing
    if 'expectedStatusChanges' not in block or block['expectedStatusChanges'] is None:
        return {
            'status': 'skipped',
            'reason': 'No expectedStatusChanges field (block never planned)'
        }

    if 'harvesting' in block['expectedStatusChanges']:
        return {
            'status': 'skipped',
            'reason': 'Already has harvesting timeline'
        }

    if 'planted' not in block['expectedStatusChanges']:
        return {
            'status': 'skipped',
            'reason': 'No planting date in expectedStatusChanges'
        }

    # Check if plant data exists
    if not plant_data:
        return {
            'status': 'error',
            'reason': f'Plant data not found for targetCrop: {block.get("targetCrop")}'
        }

    if 'growthCycle' not in plant_data:
        return {
            'status': 'error',
            'reason': f'Plant data has no growthCycle: {plant_data.get("plantName")}'
        }

    # Get planting date
    planting_date = block['expectedStatusChanges']['planted']

    # Recalculate timeline
    try:
        new_expected_dates = await calculate_expected_timeline(
            planting_date,
            plant_data['growthCycle']
        )

        # Update block
        if not dry_run:
            result = await blocks_collection.update_one(
                {"_id": block['_id']},
                {
                    "$set": {
                        "expectedStatusChanges": new_expected_dates,
                        "updatedAt": datetime.utcnow()
                    }
                }
            )

            if result.modified_count > 0:
                return {
                    'status': 'fixed',
                    'old_dates': list(block['expectedStatusChanges'].keys()),
                    'new_dates': list(new_expected_dates.keys()),
                    'added_keys': [k for k in new_expected_dates if k not in block['expectedStatusChanges']]
                }
            else:
                return {
                    'status': 'error',
                    'reason': 'Database update failed'
                }
        else:
            return {
                'status': 'would_fix',
                'old_dates': list(block['expectedStatusChanges'].keys()),
                'new_dates': list(new_expected_dates.keys()),
                'added_keys': [k for k in new_expected_dates if k not in block['expectedStatusChanges']]
            }

    except Exception as e:
        return {
            'status': 'error',
            'reason': str(e)
        }


async def run_migration(dry_run: bool = False):
    """
    Main migration function

    Args:
        dry_run: If True, only show what would be changed without updating
    """
    client = AsyncIOMotorClient(MONGO_URI)
    db = client[DB_NAME]
    blocks_collection = db.blocks
    plant_collection = db.plant_data

    print("=" * 80)
    print("Migration: Fix Missing Harvesting Timeline for All Blocks")
    print("=" * 80)
    print(f"Mode: {'DRY RUN (no changes)' if dry_run else 'LIVE (will update database)'}")
    print("=" * 80)

    # Get all blocks
    all_blocks = await blocks_collection.find({"isActive": True}).to_list(length=None)

    print(f"\nFound {len(all_blocks)} active blocks")

    # Statistics
    stats = {
        'total': len(all_blocks),
        'fixed': 0,
        'skipped': 0,
        'error': 0,
        'would_fix': 0
    }

    results = []

    # Process each block
    for block in all_blocks:
        block_code = block.get('blockCode', str(block['_id']))
        target_crop = block.get('targetCrop')

        print(f"\n{'-' * 80}")
        print(f"Block: {block_code} | State: {block.get('state')} | Crop: {block.get('targetCropName')}")

        # Get plant data if block has a target crop
        plant_data = None
        if target_crop:
            plant_data = await plant_collection.find_one({"plantDataId": target_crop})

        # Fix block timeline
        result = await fix_block_timeline(
            block,
            plant_data,
            blocks_collection,
            dry_run=dry_run
        )

        result['blockCode'] = block_code
        result['state'] = block.get('state')
        result['cropName'] = block.get('targetCropName')
        results.append(result)

        # Update stats
        stats[result['status']] += 1

        # Print result
        if result['status'] == 'fixed':
            print(f"  [FIXED] Added {', '.join(result['added_keys'])}")
        elif result['status'] == 'would_fix':
            print(f"  [WOULD FIX] Would add {', '.join(result['added_keys'])}")
        elif result['status'] == 'skipped':
            print(f"  [SKIPPED] {result['reason']}")
        elif result['status'] == 'error':
            print(f"  [ERROR] {result['reason']}")

    # Print summary
    print("\n" + "=" * 80)
    print("Migration Summary")
    print("=" * 80)
    print(f"Total blocks:        {stats['total']}")
    print(f"Fixed:               {stats['fixed']}")
    print(f"Would fix (dry-run): {stats['would_fix']}")
    print(f"Skipped:             {stats['skipped']}")
    print(f"Errors:              {stats['error']}")
    print("=" * 80)

    # Show blocks that were/would be fixed
    fixed_blocks = [r for r in results if r['status'] in ['fixed', 'would_fix']]
    if fixed_blocks:
        print("\nBlocks with updated timelines:")
        print("-" * 80)
        for r in fixed_blocks:
            print(f"  • {r['blockCode']} ({r['state']}) - {r['cropName']}")
            print(f"    Added: {', '.join(r['added_keys'])}")

    # Show errors
    error_blocks = [r for r in results if r['status'] == 'error']
    if error_blocks:
        print("\nBlocks with errors:")
        print("-" * 80)
        for r in error_blocks:
            print(f"  • {r['blockCode']} ({r['state']}) - {r['cropName']}")
            print(f"    Error: {r['reason']}")

    if dry_run:
        print("\n" + "=" * 80)
        print("[DRY-RUN COMPLETE] No changes made to database")
        print("Run with dry_run=False to apply changes")
        print("=" * 80)
    else:
        print("\n" + "=" * 80)
        print("[MIGRATION COMPLETE]")
        print("=" * 80)

    client.close()


async def main():
    """Run migration with dry-run first"""

    # First, run dry-run to show what would change
    print("\n[DRY-RUN] Running DRY RUN first to preview changes...\n")
    await run_migration(dry_run=True)

    # Ask for confirmation
    print("\n" + "=" * 80)
    response = input("\nApply these changes? (yes/no): ").strip().lower()

    if response == 'yes':
        print("\n[LIVE] Running LIVE migration...\n")
        await run_migration(dry_run=False)
    else:
        print("\n[CANCELLED] Migration cancelled - no changes made")


if __name__ == "__main__":
    # To run dry-run only:
    # asyncio.run(run_migration(dry_run=True))

    # To run with confirmation prompt:
    asyncio.run(main())

    # To run live without prompt (use with caution!):
    # asyncio.run(run_migration(dry_run=False))
