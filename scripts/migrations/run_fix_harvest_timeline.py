"""
Wrapper script to run the harvesting timeline fix migration automatically
"""

import asyncio
from fix_harvesting_timeline_for_all_blocks import run_migration

async def main():
    """Run dry-run first, then apply changes"""

    print("\n" + "=" * 80)
    print("STEP 1: DRY RUN - Preview changes")
    print("=" * 80)
    await run_migration(dry_run=True)

    print("\n" + "=" * 80)
    print("STEP 2: APPLYING CHANGES")
    print("=" * 80)
    await run_migration(dry_run=False)

if __name__ == "__main__":
    asyncio.run(main())
