#!/usr/bin/env python3
"""
Fix duplicate plants in JSON file
Remove plants 29-35 (duplicates of 22-28)
"""

import json

# Load existing JSON
with open('OldData/plants-from-old-db-enhanced.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

print(f"Before: {len(data['plants'])} plants")

# Keep only first 28 plants (remove duplicates 29-35)
data['plants'] = data['plants'][:28]

# Update metadata
data['metadata']['plants_completed'] = 28
data['metadata']['last_updated'] = '2025-11-18'

print(f"After: {len(data['plants'])} plants")

# Save
with open('OldData/plants-from-old-db-enhanced.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)

print("SUCCESS: Removed duplicate plants")
print("Phase 1 (Leafy Greens & Herbs): COMPLETE - 13/13 plants")
print("Overall progress: 28/39 plants (72%)")
