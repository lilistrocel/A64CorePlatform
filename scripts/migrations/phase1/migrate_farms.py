#!/usr/bin/env python3
"""
Phase 1.1: Migrate farm_details → farms collection

Source: OldData/220126/farm_details_rows.sql
Target: MongoDB farms collection
Records: 7
"""

import asyncio
import re
from datetime import datetime
from uuid import UUID
from motor.motor_asyncio import AsyncIOMotorClient

# MongoDB connection
MONGO_URI = "mongodb://localhost:27017"
DB_NAME = "a64core_db"

# Admin user info (for managerId/managerEmail)
ADMIN_USER_ID = None  # Will be fetched from database
ADMIN_USER_EMAIL = "admin@a64platform.com"

# SQL data - parsed from farm_details_rows.sql
FARM_DATA = [
    {"name": "Silal Upgrade Farm", "ref": "04d07eb0-3667-4900-90e4-1a89ffc2401b"},
    {"name": "Al Wagen", "ref": "222fa041-081a-41bf-a855-d39d26ae4136"},
    {"name": "Asharij-Television Farm", "ref": "69ab8d2f-3d20-4363-8895-86e159a13f35"},
    {"name": "Al Ain", "ref": "6d6360d5-19d6-41da-ba72-7a9559503857"},
    {"name": "Al Khazana", "ref": "c82d1236-ceff-4b71-b883-8db0fbc383c5"},
    {"name": "Liwa", "ref": "cd98f1da-c377-486b-acb0-2a46ea78019a"},
    {"name": "New Hydroponics", "ref": "de209b10-ee5c-4b62-b97a-50621eaceb4b"},
]

# Farm code mapping (for human-readable codes)
FARM_CODES = {
    "Silal Upgrade Farm": "F001",
    "Al Wagen": "F002",
    "Asharij-Television Farm": "F003",
    "Al Ain": "F004",
    "Al Khazana": "F005",
    "Liwa": "F006",
    "New Hydroponics": "F007",
}


async def get_admin_user(db):
    """Get admin user ID from database"""
    user = await db.users.find_one({"email": ADMIN_USER_EMAIL})
    if user:
        return str(user.get("_id") or user.get("userId"))
    return None


async def migrate_farms():
    """Migrate farm_details to farms collection"""
    print("=" * 60)
    print("Phase 1.1: Migrating farm_details → farms")
    print("=" * 60)

    # Connect to MongoDB
    client = AsyncIOMotorClient(MONGO_URI)
    db = client[DB_NAME]

    try:
        # Get admin user ID
        admin_id = await get_admin_user(db)
        if not admin_id:
            print(f"ERROR: Admin user '{ADMIN_USER_EMAIL}' not found!")
            print("Please ensure admin user exists before migration.")
            return False

        print(f"Using admin user: {ADMIN_USER_EMAIL} ({admin_id})")

        # Check if farms already exist
        existing_count = await db.farms.count_documents({})
        if existing_count > 0:
            print(f"WARNING: {existing_count} farms already exist in database!")
            response = input("Do you want to continue? (y/n): ")
            if response.lower() != 'y':
                print("Migration cancelled.")
                return False

        # Migrate each farm
        migrated = 0
        skipped = 0

        for farm in FARM_DATA:
            farm_id = farm["ref"]
            farm_name = farm["name"]
            farm_code = FARM_CODES.get(farm_name, f"F{migrated + 1:03d}")

            # Check if this farm already exists
            existing = await db.farms.find_one({"farmId": farm_id})
            if existing:
                print(f"  SKIP: {farm_name} (already exists)")
                skipped += 1
                continue

            # Create new farm document
            farm_doc = {
                "farmId": farm_id,
                "farmCode": farm_code,
                "name": farm_name,
                "description": f"Migrated from legacy system",
                "owner": None,
                "location": None,
                "totalArea": None,
                "areaUnit": "hectares",
                "numberOfStaff": None,
                "boundary": None,
                "managerId": admin_id,
                "managerEmail": ADMIN_USER_EMAIL,
                "isActive": True,
                "createdAt": datetime.utcnow(),
                "updatedAt": datetime.utcnow(),
            }

            # Insert into database
            await db.farms.insert_one(farm_doc)
            print(f"  OK: {farm_name} ({farm_code}) → {farm_id}")
            migrated += 1

        # Summary
        print("-" * 60)
        print(f"Migration complete!")
        print(f"  Migrated: {migrated}")
        print(f"  Skipped:  {skipped}")
        print(f"  Total:    {len(FARM_DATA)}")

        # Verify
        final_count = await db.farms.count_documents({})
        print(f"\nVerification: {final_count} farms now in database")

        return True

    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        client.close()


if __name__ == "__main__":
    asyncio.run(migrate_farms())
