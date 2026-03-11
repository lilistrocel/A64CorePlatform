"""
Migration Script: Multi-Division Framework

Idempotent migration that:
1. Creates default organization ("A64 Group")
2. Creates default vegetable division ("Vegetable & Fruits Division")
3. Backfills divisionId/organizationId on all operational collections
4. Updates all users with organizationId and divisionAccess

Usage:
    python scripts/migrate_to_multi_division.py

Environment variables:
    MONGODB_URL: MongoDB connection string (default: mongodb://localhost:27017)
    MONGODB_DB_NAME: Database name (default: a64core_db)

This script is safe to run multiple times (idempotent).
"""

import asyncio
import os
import sys
from datetime import datetime
from uuid import uuid4

from motor.motor_asyncio import AsyncIOMotorClient


# Configuration
MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
MONGODB_DB_NAME = os.getenv("MONGODB_DB_NAME", "a64core_db")

# Default organization and division IDs (fixed for idempotency)
DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001"
DEFAULT_VEG_DIVISION_ID = "00000000-0000-0000-0000-000000000010"

# All operational collections that need divisionId/organizationId
OPERATIONAL_COLLECTIONS = [
    # Farm Manager
    "farms", "blocks", "block_harvests", "alerts", "farm_tasks",
    "plant_data", "plant_data_enhanced", "plantings",
    "inventory_harvest", "inventory_input", "inventory_asset", "inventory_waste",
    "farm_assignments", "block_archives", "block_cycles", "weather_cache",
    # HR
    "employees", "employee_contracts", "employee_visas",
    "employee_insurance", "employee_performance",
    # CRM
    "customers",
    # Sales
    "sales_orders", "harvest_inventory", "purchase_orders", "return_orders",
    # Logistics
    "shipments", "routes", "vehicles",
    # Marketing
    "marketing_campaigns", "marketing_budgets", "marketing_events", "marketing_channels",
]


async def migrate():
    """Run the multi-division migration."""
    print(f"Connecting to MongoDB at {MONGODB_URL}...")
    client = AsyncIOMotorClient(MONGODB_URL)
    db = client[MONGODB_DB_NAME]

    # Verify connection
    try:
        await client.admin.command("ping")
        print(f"Connected to database: {MONGODB_DB_NAME}")
    except Exception as e:
        print(f"ERROR: Failed to connect to MongoDB: {e}")
        sys.exit(1)

    now = datetime.utcnow()

    # Step 1: Create default organization
    print("\n--- Step 1: Create default organization ---")
    org_doc = await db["organizations"].find_one({"organizationId": DEFAULT_ORG_ID})
    if org_doc:
        print(f"  Organization already exists: {org_doc['name']} (id={DEFAULT_ORG_ID})")
    else:
        org = {
            "organizationId": DEFAULT_ORG_ID,
            "name": "A64 Group",
            "slug": "a64-group",
            "industries": ["vegetable_fruits", "mushroom"],
            "logoUrl": None,
            "isActive": True,
            "createdAt": now,
            "updatedAt": now,
        }
        await db["organizations"].insert_one(org)
        print(f"  Created organization: A64 Group (id={DEFAULT_ORG_ID})")

    # Create indexes for organizations
    await db["organizations"].create_index("organizationId", unique=True)
    await db["organizations"].create_index("slug", unique=True)
    print("  Organizations indexes ensured.")

    # Step 2: Create default vegetable division
    print("\n--- Step 2: Create default vegetable division ---")
    div_doc = await db["divisions"].find_one({"divisionId": DEFAULT_VEG_DIVISION_ID})
    if div_doc:
        print(f"  Division already exists: {div_doc['name']} (id={DEFAULT_VEG_DIVISION_ID})")
    else:
        division = {
            "divisionId": DEFAULT_VEG_DIVISION_ID,
            "organizationId": DEFAULT_ORG_ID,
            "name": "Vegetable & Fruits Division",
            "divisionCode": "VEG-01",
            "industryType": "vegetable_fruits",
            "description": "Main vegetable and fruit farming operations",
            "settings": {},
            "isActive": True,
            "createdAt": now,
            "updatedAt": now,
        }
        await db["divisions"].insert_one(division)
        print(f"  Created division: Vegetable & Fruits Division (id={DEFAULT_VEG_DIVISION_ID})")

    # Create indexes for divisions
    await db["divisions"].create_index("divisionId", unique=True)
    await db["divisions"].create_index("organizationId")
    await db["divisions"].create_index([("organizationId", 1), ("divisionCode", 1)], unique=True)
    print("  Divisions indexes ensured.")

    # Step 3: Backfill divisionId and organizationId on all operational collections
    print("\n--- Step 3: Backfill divisionId on operational collections ---")
    total_updated = 0

    for collection_name in OPERATIONAL_COLLECTIONS:
        collection = db[collection_name]

        # Count documents without divisionId
        missing_count = await collection.count_documents({"divisionId": {"$exists": False}})
        if missing_count == 0:
            # Also check for null values
            null_count = await collection.count_documents({"divisionId": None})
            if null_count == 0:
                print(f"  {collection_name}: already migrated (0 documents need update)")
                continue
            # Update null values too
            missing_count = null_count

        result = await collection.update_many(
            {"$or": [{"divisionId": {"$exists": False}}, {"divisionId": None}]},
            {
                "$set": {
                    "divisionId": DEFAULT_VEG_DIVISION_ID,
                    "organizationId": DEFAULT_ORG_ID,
                }
            },
        )
        updated = result.modified_count
        total_updated += updated
        print(f"  {collection_name}: updated {updated} documents")

    print(f"\n  Total documents updated: {total_updated}")

    # Step 4: Update all users with organizationId and divisionAccess
    print("\n--- Step 4: Update users with organization/division fields ---")
    users_collection = db["users"]

    # Count users without organizationId
    users_missing = await users_collection.count_documents(
        {"$or": [{"organizationId": {"$exists": False}}, {"organizationId": None}]}
    )

    if users_missing == 0:
        print("  All users already have organizationId set.")
    else:
        result = await users_collection.update_many(
            {"$or": [{"organizationId": {"$exists": False}}, {"organizationId": None}]},
            {
                "$set": {
                    "organizationId": DEFAULT_ORG_ID,
                    "divisionAccess": [DEFAULT_VEG_DIVISION_ID],
                    "defaultDivisionId": DEFAULT_VEG_DIVISION_ID,
                    "updatedAt": now,
                }
            },
        )
        print(f"  Updated {result.modified_count} users with organization/division fields.")

    # Step 5: Create divisionId indexes on operational collections
    print("\n--- Step 5: Create divisionId indexes ---")
    for collection_name in OPERATIONAL_COLLECTIONS:
        try:
            await db[collection_name].create_index("divisionId")
            await db[collection_name].create_index("organizationId")
        except Exception as e:
            print(f"  WARNING: Failed to create index on {collection_name}: {e}")
    print("  divisionId and organizationId indexes created on all collections.")

    # Summary
    print("\n" + "=" * 60)
    print("Migration complete!")
    print(f"  Organization: A64 Group ({DEFAULT_ORG_ID})")
    print(f"  Division: Vegetable & Fruits Division ({DEFAULT_VEG_DIVISION_ID})")
    print(f"  Collections backfilled: {len(OPERATIONAL_COLLECTIONS)}")
    print(f"  Total documents updated: {total_updated}")
    print(f"  Users updated: {users_missing}")
    print("=" * 60)

    client.close()


if __name__ == "__main__":
    asyncio.run(migrate())
