#!/usr/bin/env python3
"""
Farm Migration Script - Local Development

Migrates 7 farms from OldData/220126/farm_details_rows.sql into the local MongoDB
via the A64 Core Platform API.

Outputs a JSON mapping file (farm_id_mapping.json) for future block migration.
"""

import requests
import json
import sys

BASE_URL = "http://localhost/api/v1"
ADMIN_EMAIL = "admin@a64platform.com"
ADMIN_PASSWORD = "SuperAdmin123!"

# 7 farms from OldData/220126/farm_details_rows.sql
OLD_FARMS = [
    {"name": "Al Khazana",              "old_ref": "c82d1236-ceff-4b71-b883-8db0fbc383c5"},
    {"name": "Silal Upgrade Farm",      "old_ref": "04d07eb0-3667-4900-90e4-1a89ffc2401b"},
    {"name": "Al Wagen",                "old_ref": "222fa041-081a-41bf-a855-d39d26ae4136"},
    {"name": "Liwa",                    "old_ref": "cd98f1da-c377-486b-acb0-2a46ea78019a"},
    {"name": "New Hydroponics",         "old_ref": "de209b10-ee5c-4b62-b97a-50621eaceb4b"},
    {"name": "Asharij-Television Farm", "old_ref": "69ab8d2f-3d20-4363-8895-86e159a13f35"},
    {"name": "Al Ain",                  "old_ref": "6d6360d5-19d6-41da-ba72-7a9559503857"},
]


def login():
    resp = requests.post(f"{BASE_URL}/auth/login",
                         json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                         timeout=15)
    if resp.status_code != 200:
        print(f"Login failed: {resp.status_code} {resp.text}")
        sys.exit(1)
    token = resp.json()["access_token"]
    print(f"Logged in as {ADMIN_EMAIL}")
    return token


def get_existing_farms(token):
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.get(f"{BASE_URL}/farm/farms", headers=headers, timeout=15)
    if resp.status_code == 200:
        body = resp.json()
        # API returns paginated: {"data": [...], "meta": {...}}
        return body.get("data", body) if isinstance(body, dict) else body
    return []


def create_farm(token, farm):
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    payload = {
        "name": farm["name"],
        "description": f"Migrated from legacy system (ref: {farm['old_ref']})",
        "owner": "A64 Platform",
        "areaUnit": "sqm",
    }
    resp = requests.post(f"{BASE_URL}/farm/farms", headers=headers, json=payload, timeout=15)
    if resp.status_code in (200, 201):
        body = resp.json()
        return body.get("data", body) if isinstance(body, dict) and "data" in body else body
    else:
        print(f"  FAILED: {resp.status_code} {resp.text[:200]}")
        return None


def main():
    print("=" * 60)
    print("Farm Migration - OldData/220126 -> Local MongoDB")
    print("=" * 60)

    token = login()

    # Check existing
    existing = get_existing_farms(token)
    existing_names = {f.get("name", "").lower() for f in existing}
    print(f"\nExisting farms: {len(existing)}")
    for f in existing:
        print(f"  {f.get('farmCode')} - {f.get('name')} ({f.get('farmId')[:8]}...)")

    # Migrate
    mapping = {}  # old_ref -> {new_id, farmCode, name}
    created = 0
    skipped = 0

    print(f"\nMigrating {len(OLD_FARMS)} farms...\n")

    for farm in OLD_FARMS:
        name = farm["name"]
        old_ref = farm["old_ref"]

        if name.lower() in existing_names:
            # Find existing farm to capture its ID for mapping
            for ef in existing:
                if ef.get("name", "").lower() == name.lower():
                    mapping[old_ref] = {
                        "new_id": ef["farmId"],
                        "farmCode": ef.get("farmCode", ""),
                        "name": name,
                        "status": "already_existed",
                    }
                    print(f"  SKIP  {name} (already exists as {ef.get('farmCode')})")
                    break
            skipped += 1
            continue

        result = create_farm(token, farm)
        if result:
            mapping[old_ref] = {
                "new_id": result["farmId"],
                "farmCode": result.get("farmCode", ""),
                "name": name,
                "status": "created",
            }
            print(f"  OK    {name} -> {result.get('farmCode')} ({result['farmId'][:8]}...)")
            created += 1
        else:
            print(f"  FAIL  {name}")

    # Save mapping
    mapping_file = "scripts/farm_id_mapping.json"
    with open(mapping_file, "w") as f:
        json.dump(mapping, f, indent=2)

    # Summary
    print(f"\nDone: {created} created, {skipped} skipped")
    print(f"Mapping saved to {mapping_file}")

    # Show final state
    print("\nFinal farms:")
    final = get_existing_farms(token)
    for f in sorted(final, key=lambda x: x.get("farmCode", "")):
        print(f"  {f.get('farmCode')} - {f.get('name')}")

    print(f"\nMapping (old_ref -> new):")
    for old_ref, info in mapping.items():
        print(f"  {old_ref[:8]}... -> {info['farmCode']} ({info['name']})")


if __name__ == "__main__":
    main()
