# Database Migrations

This directory contains migration scripts for updating the A64 Core Platform database schema and data.

## Migration Scripts

### `fix_harvesting_timeline_for_all_blocks.py`

**Purpose**: Fixes missing "harvesting" timeline for blocks with crops that have no flowering phase (leafy greens).

**Problem Addressed**:
- Blocks planted with lettuce, spinach, kale, and other leafy greens were missing the "harvesting" key in their `expectedStatusChanges`
- This caused the dashboard to not display "days until next transition"
- Root cause: Original timeline calculation required `floweringDays > 0`, but leafy greens have `floweringDays: 0`

**What It Does**:
1. Scans all active blocks in the database
2. Identifies blocks missing "harvesting" in `expectedStatusChanges`
3. Recalculates complete timeline using proper logic that handles `floweringDays: 0`
4. Updates blocks with corrected timeline

**Safety Features**:
- ✅ Dry-run mode by default (preview changes without applying)
- ✅ Interactive confirmation prompt before applying changes
- ✅ Only updates blocks that need fixing
- ✅ Safe to run multiple times (idempotent)
- ✅ Detailed logging of all changes

**Usage**:

```bash
# Run with interactive confirmation (recommended)
python scripts/migrations/fix_harvesting_timeline_for_all_blocks.py

# This will:
# 1. Show dry-run preview of what would change
# 2. Ask for confirmation
# 3. Apply changes if confirmed
```

**Alternative Usage**:

```python
# Dry-run only (no changes)
import asyncio
from fix_harvesting_timeline_for_all_blocks import run_migration
asyncio.run(run_migration(dry_run=True))

# Apply changes without prompt (use with caution!)
asyncio.run(run_migration(dry_run=False))
```

**Output Example**:

```
================================================================================
Migration: Fix Missing Harvesting Timeline for All Blocks
================================================================================
Mode: DRY RUN (no changes)
================================================================================

Found 5 active blocks

────────────────────────────────────────────────────────────────────────────────
Block: F001-002 | State: harvesting | Crop: Test Lettuce (Fixed Timeline)
  🔍 WOULD FIX: Would add harvesting

────────────────────────────────────────────────────────────────────────────────
Block: F001-003 | State: empty | Crop: None
  ⏭️  SKIPPED: No expectedStatusChanges field (block never planned)

================================================================================
Migration Summary
================================================================================
Total blocks:        5
Fixed:               0
Would fix (dry-run): 2
Skipped:             2
Errors:              1
================================================================================

Apply these changes? (yes/no):
```

**When to Run**:
- After deploying the fix to `block_service_new.py`
- When blocks are showing incomplete timelines
- After restoring from old database backup

**Related Code Changes**:
- `modules/farm-management/src/services/block/block_service_new.py` (lines 90-99)
- Fixed to handle `floweringDays: 0` for leafy greens

## Migration Best Practices

1. **Always run dry-run first** to preview changes
2. **Backup database** before running migrations in production
3. **Test on staging** environment first
4. **Review logs** after migration completes
5. **Verify data** manually after migration

## Creating New Migrations

When creating a new migration script, follow this template:

```python
"""
Migration: [Brief Title]

PROBLEM:
[Describe what's broken or needs fixing]

ROOT CAUSE:
[Explain why this happened]

SOLUTION:
[Describe how this migration fixes it]

SAFE TO RUN MULTIPLE TIMES:
[Explain idempotency - what happens if run twice]
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime

MONGO_URI = "mongodb://localhost:27017"
DB_NAME = "a64core_db"

async def run_migration(dry_run: bool = False):
    """
    Main migration function

    Args:
        dry_run: If True, only show what would be changed without updating
    """
    # Implementation here
    pass

async def main():
    """Run migration with dry-run first"""
    # Dry-run preview
    await run_migration(dry_run=True)

    # Confirmation
    response = input("\nApply these changes? (yes/no): ").strip().lower()

    if response == 'yes':
        await run_migration(dry_run=False)
    else:
        print("\n❌ Migration cancelled")

if __name__ == "__main__":
    asyncio.run(main())
```

## Troubleshooting

### Migration fails with connection error
```bash
# Check MongoDB is running
docker-compose ps mongodb

# Check connection
mongosh mongodb://localhost:27017/a64core_db --eval "db.stats()"
```

### Migration shows errors for specific blocks
- Review the error message in the output
- Check if plant data exists for those blocks
- Manually inspect the block in MongoDB

### Want to revert migration changes
- Restore from database backup taken before migration
- Or manually update the affected blocks using MongoDB shell

## Migration Log

| Date | Script | Description | Blocks Affected |
|------|--------|-------------|-----------------|
| 2025-11-18 | `fix_harvesting_timeline_for_all_blocks.py` | Fixed missing harvesting timeline for leafy greens | 2 blocks (F001-002, F001-004) |
