#!/usr/bin/env python3
"""
Farm Migration Script

Migrates farms from old data to the new A64 Core Platform.
Target: Remote production server (a64core.com)
"""

import requests
import json
from typing import Optional

# Configuration
BASE_URL = "https://a64core.com/api/v1"
LOGIN_URL = f"{BASE_URL}/auth/login"
FARMS_URL = f"{BASE_URL}/farm/farms"

# Admin credentials
ADMIN_EMAIL = "admin@a64platform.com"
ADMIN_PASSWORD = "SuperAdmin123!"

# Old farm data with additional metadata
OLD_FARMS = [
    {
        "name": "Al Khazana",
        "old_ref": "c82d1236-ceff-4b71-b883-8db0fbc383c5",
        "description": "Al Khazana Farm - Migrated from legacy system",
        "owner": "A64 Platform",
    },
    {
        "name": "Silal Upgrade Farm",
        "old_ref": "04d07eb0-3667-4900-90e4-1a89ffc2401b",
        "description": "Silal Upgrade Farm - Migrated from legacy system",
        "owner": "A64 Platform",
    },
    {
        "name": "Al Wagen",
        "old_ref": "222fa041-081a-41bf-a855-d39d26ae4136",
        "description": "Al Wagen Farm - Migrated from legacy system",
        "owner": "A64 Platform",
    },
    {
        "name": "Liwa",
        "old_ref": "cd98f1da-c377-486b-acb0-2a46ea78019a",
        "description": "Liwa Farm - Migrated from legacy system",
        "owner": "A64 Platform",
    },
    {
        "name": "New Hydroponics",
        "old_ref": "de209b10-ee5c-4b62-b97a-50621eaceb4b",
        "description": "New Hydroponics Farm - Migrated from legacy system",
        "owner": "A64 Platform",
    },
]

# Al Ain is already in the system, storing ref mapping for blocks migration later
EXISTING_FARMS = {
    "Al Ain": {
        "old_ref": "6d6360d5-19d6-41da-ba72-7a9559503857",
        "note": "Already exists as 'Al Ain Farm' in new system"
    }
}


def login() -> Optional[str]:
    """Login and get access token"""
    print(f"\n{'='*60}")
    print("Logging in to A64 Core Platform...")
    print(f"{'='*60}")

    try:
        response = requests.post(
            LOGIN_URL,
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
            timeout=30
        )

        if response.status_code == 200:
            token = response.json().get("access_token")
            print(f"✅ Login successful!")
            return token
        else:
            print(f"❌ Login failed: {response.status_code}")
            print(f"   Response: {response.text}")
            return None

    except Exception as e:
        print(f"❌ Login error: {e}")
        return None


def get_existing_farms(token: str) -> list:
    """Get list of existing farms"""
    headers = {"Authorization": f"Bearer {token}"}

    try:
        response = requests.get(FARMS_URL, headers=headers, timeout=30)
        if response.status_code == 200:
            return response.json()
        return []
    except Exception as e:
        print(f"❌ Error fetching farms: {e}")
        return []


def create_farm(token: str, farm_data: dict) -> Optional[dict]:
    """Create a new farm"""
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    # Prepare farm creation payload
    payload = {
        "name": farm_data["name"],
        "description": farm_data.get("description"),
        "owner": farm_data.get("owner"),
        "areaUnit": "hectares",
    }

    try:
        response = requests.post(
            FARMS_URL,
            headers=headers,
            json=payload,
            timeout=30
        )

        if response.status_code in [200, 201]:
            return response.json()
        else:
            print(f"   ❌ Failed: {response.status_code} - {response.text}")
            return None

    except Exception as e:
        print(f"   ❌ Error: {e}")
        return None


def migrate_farms():
    """Main migration function"""
    print("\n" + "="*60)
    print("🚀 FARM MIGRATION - Old Data to A64 Core Platform")
    print("="*60)
    print(f"Target: {BASE_URL}")
    print(f"Farms to migrate: {len(OLD_FARMS)}")

    # Login
    token = login()
    if not token:
        print("\n❌ Migration aborted - could not authenticate")
        return

    # Get existing farms
    print(f"\n{'='*60}")
    print("Checking existing farms...")
    print(f"{'='*60}")

    existing_farms = get_existing_farms(token)
    existing_names = [f.get("name", "").lower() for f in existing_farms]

    print(f"Found {len(existing_farms)} existing farms:")
    for farm in existing_farms:
        print(f"  - {farm.get('name')} (ID: {farm.get('farmId')})")

    # Migrate farms
    print(f"\n{'='*60}")
    print("Creating new farms...")
    print(f"{'='*60}")

    created = 0
    skipped = 0
    failed = 0

    # Store mapping for future block migration
    farm_mapping = {}

    for farm in OLD_FARMS:
        farm_name = farm["name"]
        print(f"\n📍 Processing: {farm_name}")
        print(f"   Old Ref: {farm['old_ref']}")

        # Check if already exists
        if farm_name.lower() in existing_names:
            print(f"   ⏭️  Skipped - already exists")
            skipped += 1
            continue

        # Create farm
        result = create_farm(token, farm)
        if result:
            new_id = result.get("farmId")
            print(f"   ✅ Created! New ID: {new_id}")
            farm_mapping[farm["old_ref"]] = {
                "old_ref": farm["old_ref"],
                "new_id": new_id,
                "name": farm_name
            }
            created += 1
        else:
            failed += 1

    # Summary
    print(f"\n{'='*60}")
    print("📊 MIGRATION SUMMARY")
    print(f"{'='*60}")
    print(f"✅ Created: {created}")
    print(f"⏭️  Skipped: {skipped}")
    print(f"❌ Failed:  {failed}")

    # Save mapping for future use (blocks migration)
    if farm_mapping:
        mapping_file = "farm_id_mapping.json"
        with open(mapping_file, "w") as f:
            json.dump(farm_mapping, f, indent=2)
        print(f"\n📝 Farm ID mapping saved to: {mapping_file}")

    # Final farms list
    print(f"\n{'='*60}")
    print("📋 FINAL FARMS LIST")
    print(f"{'='*60}")

    final_farms = get_existing_farms(token)
    for farm in final_farms:
        print(f"  - {farm.get('name')}")
        print(f"    ID: {farm.get('farmId')}")
        print(f"    Active: {farm.get('isActive')}")

    print(f"\n✅ Migration complete!")


if __name__ == "__main__":
    migrate_farms()
