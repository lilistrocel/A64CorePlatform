#!/usr/bin/env python3
"""
Import UAE Popular Plants Enhanced Dataset into MongoDB
Run from: data/starter-data/plants/
"""

import json
from datetime import datetime
import subprocess
import sys

# Load the JSON dataset
print("Loading plant dataset...")
with open('uae-popular-plants-enhanced.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

plants = data['plants']
print(f"Found {len(plants)} plants to import")

# Prepare plants for import with required database fields
plants_for_db = []
for plant in plants:
    plant_doc = {
        **plant,
        "createdBy": "system-import",
        "createdByEmail": "admin@a64platform.com",
        "createdAt": datetime.utcnow().isoformat() + "Z",
        "updatedAt": datetime.utcnow().isoformat() + "Z",
        "dataVersion": 1,
        "deletedAt": None
    }
    plants_for_db.append(plant_doc)

# Write prepared data to temporary file
temp_file = '/tmp/plants_import.json'
with open(temp_file, 'w', encoding='utf-8') as f:
    for plant_doc in plants_for_db:
        json.dump(plant_doc, f)
        f.write('\n')

print(f"Prepared {len(plants_for_db)} plants for import")
print("Importing into MongoDB...")

# Import using mongoimport
result = subprocess.run([
    'docker', 'exec', '-i', 'a64core-mongodb-dev',
    'mongoimport',
    '--db', 'a64core_db',
    '--collection', 'plant_data_enhanced',
    '--file', temp_file,
    '--mode', 'upsert'
], capture_output=True, text=True)

if result.returncode == 0:
    print(f"✓ Successfully imported {len(plants_for_db)} plants!")

    # Verify import
    verify_result = subprocess.run([
        'docker', 'exec', 'a64core-mongodb-dev',
        'mongosh', 'a64core_db', '--quiet', '--eval',
        'db.plant_data_enhanced.countDocuments()'
    ], capture_output=True, text=True)

    if verify_result.returncode == 0:
        count = verify_result.stdout.strip()
        print(f"✓ Verification: {count} plants in database")
    else:
        print(f"! Could not verify import")
else:
    print(f"✗ Import failed:")
    print(result.stderr)
    sys.exit(1)

print("\nDone!")
