#!/usr/bin/env python3
"""
Import Enhanced Plant Data to Remote MongoDB
Checks for conflicts and handles duplicates intelligently
"""

import json
import sys
from pymongo import MongoClient
from datetime import datetime

# MongoDB connection
MONGO_URI = "mongodb://localhost:27017/a64core_db"

def connect_to_mongodb():
    """Connect to MongoDB"""
    try:
        client = MongoClient(MONGO_URI)
        db = client['a64core_db']
        # Test connection
        client.server_info()
        print(f"✅ Connected to MongoDB: {MONGO_URI}")
        return db
    except Exception as e:
        print(f"❌ Error connecting to MongoDB: {e}")
        sys.exit(1)

def load_plant_data():
    """Load plant data from JSON file"""
    try:
        with open('plants-from-old-db-enhanced.json', 'r', encoding='utf-8') as f:
            data = json.load(f)
        plants = data['plants']
        print(f"✅ Loaded {len(plants)} plants from JSON file")
        return plants
    except Exception as e:
        print(f"❌ Error loading plant data: {e}")
        sys.exit(1)

def check_existing_plants(db):
    """Check what plants already exist in database"""
    try:
        existing = list(db.plants.find({}, {'plantName': 1, 'scientificName': 1, '_id': 0}))
        print(f"\n📊 Found {len(existing)} existing plants in database:")
        for plant in existing:
            print(f"   - {plant.get('plantName', 'N/A')} ({plant.get('scientificName', 'N/A')})")
        return existing
    except Exception as e:
        print(f"❌ Error checking existing plants: {e}")
        return []

def find_conflicts(new_plants, existing_plants):
    """Find conflicts between new and existing plants"""
    conflicts = []
    existing_names = {p.get('plantName', '').lower() for p in existing_plants}
    existing_scientific = {p.get('scientificName', '').lower() for p in existing_plants}

    for plant in new_plants:
        plant_name = plant.get('plantName', '').lower()
        scientific_name = plant.get('scientificName', '').lower()

        if plant_name in existing_names or scientific_name in existing_scientific:
            conflicts.append({
                'plantName': plant['plantName'],
                'scientificName': plant['scientificName']
            })

    return conflicts

def import_plants(db, plants, mode='skip'):
    """
    Import plants to MongoDB

    Args:
        db: MongoDB database connection
        plants: List of plant documents to import
        mode: 'skip' (skip conflicts), 'update' (update existing), 'replace' (replace all)
    """

    print(f"\n🚀 Starting import in '{mode}' mode...")

    imported = 0
    skipped = 0
    updated = 0
    errors = 0

    for plant in plants:
        plant_name = plant['plantName']

        try:
            # Check if plant exists
            existing = db.plants.find_one({
                '$or': [
                    {'plantName': plant_name},
                    {'scientificName': plant['scientificName']}
                ]
            })

            if existing:
                if mode == 'skip':
                    print(f"   ⏭️  Skipping: {plant_name} (already exists)")
                    skipped += 1
                elif mode == 'update':
                    # Update existing plant
                    plant['updatedAt'] = datetime.utcnow().isoformat()
                    db.plants.update_one(
                        {'_id': existing['_id']},
                        {'$set': plant}
                    )
                    print(f"   ✏️  Updated: {plant_name}")
                    updated += 1
                elif mode == 'replace':
                    # Delete and re-insert
                    db.plants.delete_one({'_id': existing['_id']})
                    plant['createdAt'] = datetime.utcnow().isoformat()
                    plant['updatedAt'] = datetime.utcnow().isoformat()
                    db.plants.insert_one(plant)
                    print(f"   🔄 Replaced: {plant_name}")
                    updated += 1
            else:
                # Insert new plant
                plant['createdAt'] = datetime.utcnow().isoformat()
                plant['updatedAt'] = datetime.utcnow().isoformat()
                db.plants.insert_one(plant)
                print(f"   ✅ Imported: {plant_name}")
                imported += 1

        except Exception as e:
            print(f"   ❌ Error importing {plant_name}: {e}")
            errors += 1

    # Print summary
    print(f"\n" + "=" * 70)
    print(f"IMPORT SUMMARY")
    print(f"=" * 70)
    print(f"  ✅ Imported (new):     {imported}")
    print(f"  ✏️  Updated (existing): {updated}")
    print(f"  ⏭️  Skipped (conflicts): {skipped}")
    print(f"  ❌ Errors:             {errors}")
    print(f"=" * 70)

    # Verify final count
    total_plants = db.plants.count_documents({})
    print(f"\n📊 Total plants in database: {total_plants}")

    return {
        'imported': imported,
        'updated': updated,
        'skipped': skipped,
        'errors': errors,
        'total': total_plants
    }

def main():
    """Main import process"""

    print("=" * 70)
    print("PLANT DATA IMPORT TO MONGODB")
    print("=" * 70)

    # Connect to MongoDB
    db = connect_to_mongodb()

    # Load plant data
    plants = load_plant_data()

    # Check existing plants
    existing = check_existing_plants(db)

    # Find conflicts
    conflicts = find_conflicts(plants, existing)

    if conflicts:
        print(f"\n⚠️  WARNING: Found {len(conflicts)} conflicts:")
        for conflict in conflicts:
            print(f"   - {conflict['plantName']} ({conflict['scientificName']})")

        print(f"\nOptions:")
        print(f"  1. Skip conflicts (import only new plants)")
        print(f"  2. Update existing (merge with existing plants)")
        print(f"  3. Replace all (delete and re-import conflicting plants)")
        print(f"  4. Cancel import")

        choice = input(f"\nEnter your choice (1-4): ").strip()

        if choice == '1':
            mode = 'skip'
        elif choice == '2':
            mode = 'update'
        elif choice == '3':
            mode = 'replace'
        elif choice == '4':
            print("❌ Import cancelled")
            return
        else:
            print("❌ Invalid choice. Import cancelled.")
            return
    else:
        print(f"\n✅ No conflicts found. All {len(plants)} plants are new.")
        mode = 'skip'  # Default mode when no conflicts

    # Import plants
    result = import_plants(db, plants, mode)

    print(f"\n✅ Import complete!")

if __name__ == "__main__":
    main()
