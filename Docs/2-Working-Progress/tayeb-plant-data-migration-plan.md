# Tayeb Plant Data Migration Plan

## Overview

Migrate Tayeb's agronomist operational planning data from `OldData/json_exports/standard_planning.json` to the remote production server, with new tracking fields for contributor and target region.

## Source Data

- **File**: `OldData/json_exports/standard_planning.json`
- **Total Plants**: 57 unique plant/variety entries (excluding "Empty")
- **Data Type**: Operational farm planning data with detailed fertilizer schedules
- **Origin**: Tayeb's agronomist research for UAE greenhouse/open field farming

### Source Data Structure

Each plant record contains:
- `Item`: Plant name/variety
- `SowingDurationday`: Days from sowing to harvest start
- `HarvestDurationday`: Duration of harvest period
- `TotalDurationday`: Total growth cycle
- `NetYieldPerDripkg`: Yield per drip point (kg)
- `ProductsPerDripkg`: Products per drip point
- `seedsPerDrip`: Seeds per planting point
- `SeedingType`: "Seed" or transplant method
- `PollinationLosspercent`: Expected pollination/crop loss %
- `DaysOfFertilize`: Total fertilization period
- `harvestInterval`: Days between harvests
- `PlanningFertilizer`: Detailed day-by-day fertilizer schedule with:
  - Day array (application days)
  - Quantities for each fertilizer type (28.14.14, 20.20.20, MAP, Potassium Sulfate, Potassium Nitrate, Cal Nitrate, Mg Sulfate, MKP, Amino Acids, Humic, etc.)
- `ProcessedFertilizerData`: Summarized fertilizer totals
- `img`: Image URL (Firebase storage)

### Plants to Migrate (57 items)

| # | Plant Name | Key Data |
|---|-----------|----------|
| 1 | Red Long Chili | 210 days total, 3.2 kg/drip |
| 2 | Habanero - Green | 180 days, 4.5 kg/drip |
| 3 | Capsicum - Green | Bell pepper variety |
| 4 | Habanero - Red | Hot pepper variety |
| 5 | Sweet Corn | 90+ days |
| 6 | Cauliflower | Brassica |
| 7 | Melon | General melon |
| 8 | Honeydew Melon | Melon variety |
| 9 | Eggplant | Solanaceae |
| 10 | Lettuce - Radicchio | Chicory type |
| 11 | Tomato-Cherry | Small tomato |
| 12 | Hot Pepper | General hot pepper |
| 13 | Lettuce - Frisee | Curly endive |
| 14 | Ash Gourd | Winter melon |
| 15 | Lettuce - Oakleaf Red | Red oakleaf |
| 16 | Cabbage - Round Red | Red cabbage |
| 17 | Tomato-Round-Table | Table tomato |
| 18 | Long Beans | Yard long beans |
| 19 | Cabbage - Flat | Flat cabbage |
| 20 | Long White Pumpkin | Squash variety |
| 21 | Cabbage - Round White | Green cabbage |
| 22 | Tomato-Beef | Beefsteak tomato |
| 23 | Marrow | Vegetable marrow |
| 24 | Capsicum - Red | Red bell pepper |
| 25 | Tomato-OF | Open field tomato |
| 26 | Mulukhiyah | Jute mallow |
| 27 | Celery | Apium |
| 28 | Cucumber | Cucumis |
| 29 | Habanero - Orange | Hot pepper |
| 30 | Sweet Melon | Melon variety |
| 31 | Hydroponics Bionda | Hydro lettuce |
| 32 | Lettuce - Romaine | Cos lettuce |
| 33 | Okra | Lady finger |
| 34 | Snap Beans | Green beans |
| 35 | Hydroponics Gem | Hydro lettuce |
| 36 | Lettuce - Lollo Bionda | Green lollo |
| 37 | Zucchini - Yellow | Yellow squash |
| 38 | Hydroponics Frisee | Hydro frisee |
| 39 | Lettuce - Lollo Rosso | Red lollo |
| 40 | Watermelon | Citrullus |
| 41 | Hydroponics Boston | Hydro boston |
| 42 | Onion - White | Allium |
| 43 | Hydroponics Rosso | Hydro red lettuce |
| 44 | Habanero - Yellow | Hot pepper |
| 45 | Zucchini - Green | Green squash |
| 46 | Hydroponics Oak Leafs | Hydro oakleaf |
| 47 | Fennel | Florence fennel |
| 48 | Rock Melon | Cantaloupe |
| 49 | Butternut | Butternut squash |
| 50 | Green Beans | Bush beans |
| 51 | Leeks | Allium |
| 52 | Potato | Solanum |
| 53 | Lettuce - Iceberg | Head lettuce |
| 54 | Lettuce - Boston | Butterhead |
| 55 | Capsicum - Yellow | Yellow pepper |
| 56 | (Empty - skip) | - |

---

## Phase 1: Schema Updates

### 1.1 Add New Fields to Backend Model

**File**: `src/modules/farm_manager/models/plant_data_enhanced.py`

Add the following fields to `PlantDataEnhancedBase`:

```python
# ===== 15. Contributor Information =====
contributor: Optional[str] = Field(
    None,
    max_length=200,
    description="Name of the agronomist or contributor who provided/researched this data"
)

# ===== 16. Target Region =====
targetRegion: Optional[str] = Field(
    None,
    max_length=200,
    description="Geographic region where this data was tested/validated (e.g., UAE, Saudi Arabia, Egypt)"
)
```

Add to `PlantDataEnhancedUpdate`:

```python
contributor: Optional[str] = Field(None, max_length=200)
targetRegion: Optional[str] = Field(None, max_length=200)
```

### 1.2 Update Frontend Types

**File**: `frontend/user-portal/src/types/farm.ts`

Add to `PlantDataEnhanced` interface:

```typescript
contributor?: string;
targetRegion?: string;
```

Add to `PlantDataEnhancedUpdate` interface:

```typescript
contributor?: string;
targetRegion?: string;
```

### 1.3 Update Frontend UI (Optional)

**File**: `frontend/user-portal/src/components/farm/EditPlantDataModal.tsx`

Add display fields for contributor and targetRegion in the Basic Information section.

---

## Phase 2: Data Transformation

### 2.1 Field Mapping (standard_planning.json → PlantDataEnhanced)

| Source Field | Target Field | Transformation |
|--------------|--------------|----------------|
| `Item` | `plantName` | Append "-Tayeb" |
| - | `scientificName` | Lookup from reference or set "TBD" |
| - | `farmTypeCompatibility` | Default: `["open_field", "greenhouse"]` |
| `SowingDurationday` | `growthCycle.germinationDays` + `vegetativeDays` | Split appropriately |
| `HarvestDurationday` | `growthCycle.harvestDurationDays` | Direct mapping |
| `TotalDurationday` | `growthCycle.totalCycleDays` | Direct mapping |
| `NetYieldPerDripkg` | `yieldInfo.yieldPerPlant` | Direct mapping |
| - | `yieldInfo.yieldUnit` | Default: "kg" |
| `PollinationLosspercent` | `yieldInfo.expectedWastePercentage` | Direct mapping |
| `PlanningFertilizer` | `fertilizerSchedule[]` | Transform day-by-day to stage-based |
| `SeedingType` | `additionalInfo.notes` | Include as note |
| `seedsPerDrip` | `additionalInfo.notes` | Include as note |
| `harvestInterval` | `additionalInfo.notes` | Include as note |
| - | `contributor` | "Tayeb" |
| - | `targetRegion` | "UAE" |

### 2.2 Fertilizer Schedule Transformation

The source has detailed day-by-day arrays. Transform to stage-based format:

```python
def transform_fertilizer_schedule(planning_fertilizer, total_days):
    """Transform day-by-day fertilizer to stage-based schedule"""
    stages = []

    # Group fertilizers by stage based on day ranges
    # Early (days 1-30): "planting" stage
    # Mid (days 31-60): "vegetative" stage
    # Late (days 61+): "flowering/fruiting" stage

    for fert_name, values in planning_fertilizer.items():
        if fert_name == "Day":
            continue

        # Calculate total for this fertilizer
        total = sum(v for v in values if v > 0)
        if total > 0:
            # Determine primary application period
            days = planning_fertilizer["Day"]
            early_sum = sum(values[i] for i, d in enumerate(days) if d <= 30 and i < len(values))
            mid_sum = sum(values[i] for i, d in enumerate(days) if 30 < d <= 60 and i < len(values))
            late_sum = sum(values[i] for i, d in enumerate(days) if d > 60 and i < len(values))

            # Create stage entries based on where most fertilizer is applied
            if early_sum > 0:
                stages.append({
                    "stage": "planting",
                    "fertilizerType": fert_name,
                    "quantityPerPlant": round(early_sum, 2),
                    "quantityUnit": "grams",
                    "frequencyDays": 7,
                    "npkRatio": extract_npk(fert_name),
                    "notes": f"UAE-tested schedule by Tayeb"
                })
            # ... similar for mid and late stages

    return stages
```

### 2.3 Create Migration Script

**File**: `OldData/migrate_tayeb_standard_planning.py`

```python
#!/usr/bin/env python3
"""
Migrate Tayeb's standard_planning.json to PlantDataEnhanced format.

Source: OldData/json_exports/standard_planning.json
Target: Remote API at https://a64core.com/api/v1/farm/plant-data-enhanced

Transformations:
- Plant names: "{name}-Tayeb"
- contributor: "Tayeb"
- targetRegion: "UAE"
- Fertilizer schedules: Day-by-day → Stage-based
"""

import json
import requests
import uuid
from datetime import datetime
from typing import Dict, List, Any

# Configuration
REMOTE_API_URL = "https://a64core.com/api/v1"
LOCAL_API_URL = "http://localhost/api/v1"

ADMIN_EMAIL = "admin@a64platform.com"
ADMIN_PASSWORD = "SuperAdmin123!"

CONTRIBUTOR = "Tayeb"
TARGET_REGION = "UAE"

# Scientific name lookup (partial - expand as needed)
SCIENTIFIC_NAMES = {
    "Red Long Chili": "Capsicum annuum",
    "Habanero": "Capsicum chinense",
    "Capsicum": "Capsicum annuum",
    "Sweet Corn": "Zea mays var. saccharata",
    "Cauliflower": "Brassica oleracea var. botrytis",
    "Melon": "Cucumis melo",
    "Honeydew Melon": "Cucumis melo var. inodorus",
    "Eggplant": "Solanum melongena",
    "Lettuce": "Lactuca sativa",
    "Tomato": "Solanum lycopersicum",
    "Hot Pepper": "Capsicum annuum",
    "Ash Gourd": "Benincasa hispida",
    "Cabbage": "Brassica oleracea var. capitata",
    "Long Beans": "Vigna unguiculata subsp. sesquipedalis",
    "Marrow": "Cucurbita pepo",
    "Mulukhiyah": "Corchorus olitorius",
    "Celery": "Apium graveolens",
    "Cucumber": "Cucumis sativus",
    "Sweet Melon": "Cucumis melo",
    "Okra": "Abelmoschus esculentus",
    "Snap Beans": "Phaseolus vulgaris",
    "Green Beans": "Phaseolus vulgaris",
    "Zucchini": "Cucurbita pepo",
    "Watermelon": "Citrullus lanatus",
    "Onion": "Allium cepa",
    "Fennel": "Foeniculum vulgare",
    "Rock Melon": "Cucumis melo var. cantalupensis",
    "Butternut": "Cucurbita moschata",
    "Leeks": "Allium ampeloprasum",
    "Potato": "Solanum tuberosum",
}

def get_scientific_name(item_name: str) -> str:
    """Lookup scientific name from item name"""
    for key, value in SCIENTIFIC_NAMES.items():
        if key.lower() in item_name.lower():
            return value
    return "Species TBD"

def transform_fertilizer_schedule(planning_fert: Dict, total_days: int) -> List[Dict]:
    """Transform day-by-day fertilizer to stage-based schedule"""
    if not planning_fert or "Day" not in planning_fert:
        return []

    stages = []
    days = planning_fert.get("Day", [])

    for fert_name, values in planning_fert.items():
        if fert_name == "Day" or not isinstance(values, list):
            continue

        # Calculate totals by growth stage
        total = sum(v for v in values if isinstance(v, (int, float)) and v > 0)
        if total <= 0:
            continue

        # Determine NPK ratio from fertilizer name
        npk = fert_name if any(c.isdigit() for c in fert_name) else "varies"

        # Create simplified stage entry
        avg_per_application = total / max(sum(1 for v in values if v > 0), 1)
        freq = 7  # Default weekly

        stages.append({
            "stage": "vegetative",  # Default stage
            "fertilizerType": fert_name,
            "quantityPerPlant": round(avg_per_application, 2),
            "quantityUnit": "grams",
            "frequencyDays": freq,
            "npkRatio": npk,
            "notes": f"Total: {round(total, 2)}g over cycle. UAE-tested by Tayeb."
        })

    return stages[:5]  # Limit to top 5 fertilizers

def transform_plant(source: Dict) -> Dict:
    """Transform standard_planning record to PlantDataEnhanced format"""
    item_name = source.get("Item", "Unknown")

    # Skip empty entries
    if item_name.lower() == "empty":
        return None

    total_days = source.get("TotalDurationday", 90)
    sowing_days = source.get("SowingDurationday", 60)
    harvest_days = source.get("HarvestDurationday", 30)

    # Estimate growth stages
    germination = min(14, sowing_days // 6)
    vegetative = sowing_days - germination
    flowering = max(0, total_days - sowing_days - harvest_days) // 2
    fruiting = max(0, total_days - sowing_days - harvest_days - flowering)

    transformed = {
        "plantName": f"{item_name}-Tayeb",
        "scientificName": get_scientific_name(item_name),
        "farmTypeCompatibility": ["open_field", "greenhouse"],

        "growthCycle": {
            "germinationDays": germination,
            "vegetativeDays": vegetative,
            "floweringDays": flowering,
            "fruitingDays": fruiting,
            "harvestDurationDays": harvest_days,
            "totalCycleDays": total_days
        },

        "yieldInfo": {
            "yieldPerPlant": source.get("NetYieldPerDripkg", 1.0),
            "yieldUnit": "kg",
            "expectedWastePercentage": source.get("PollinationLosspercent", 15)
        },

        "fertilizerSchedule": transform_fertilizer_schedule(
            source.get("PlanningFertilizer", {}),
            total_days
        ),

        "pesticideSchedule": [],  # Not in source data

        "environmentalRequirements": {
            "temperature": {
                "minCelsius": 15.0,
                "maxCelsius": 40.0,
                "optimalCelsius": 28.0
            },
            "humidity": {
                "minPercentage": 40,
                "maxPercentage": 80,
                "optimalPercentage": 60
            },
            "co2RequirementPpm": 800,
            "airCirculation": "Good ventilation required for UAE climate"
        },

        "wateringRequirements": {
            "frequencyDays": 1,
            "waterType": "filtered",
            "amountPerPlantLiters": 2.0,
            "droughtTolerance": "low",
            "notes": "Drip irrigation system - UAE conditions"
        },

        "soilRequirements": {
            "phRequirements": {
                "minPH": 6.0,
                "maxPH": 7.5,
                "optimalPH": 6.8
            },
            "soilTypes": ["loamy", "sandy"],
            "nutrientsRecommendations": "See fertilizer schedule",
            "ecRangeMs": "1.5-2.5",
            "tdsRangePpm": "800-1400",
            "notes": "Adapted for UAE soil conditions"
        },

        "diseasesAndPests": [],  # Not in source data

        "lightRequirements": {
            "lightType": "full_sun",
            "minHoursDaily": 6,
            "maxHoursDaily": 14,
            "optimalHoursDaily": 10,
            "intensityLux": 40000,
            "intensityPpfd": 400,
            "photoperiodSensitive": False,
            "notes": "UAE sunlight conditions"
        },

        "gradingStandards": [],

        "economicsAndLabor": {
            "averageMarketValuePerKg": None,
            "currency": "AED",
            "totalManHoursPerPlant": 2.0,
            "plantingHours": 0.2,
            "maintenanceHours": 1.0,
            "harvestingHours": 0.8,
            "notes": f"Harvest interval: {source.get('harvestInterval', 1)} days"
        },

        "additionalInfo": {
            "growthHabit": "bush",
            "spacing": {
                "betweenPlantsCm": 50,
                "betweenRowsCm": 100,
                "plantsPerSquareMeter": 2.0
            },
            "supportRequirements": "varies",
            "companionPlants": None,
            "incompatiblePlants": None,
            "notes": f"Seeding: {source.get('SeedingType', 'Seed')}. Seeds/drip: {source.get('seedsPerDrip', 1)}. Original ID: {source.get('__id__', 'N/A')}"
        },

        "contributor": CONTRIBUTOR,
        "targetRegion": TARGET_REGION,

        "tags": ["UAE", "Tayeb", "drip-irrigation"],
        "dataVersion": 1,
        "createdByEmail": "tayeb@a64platform.com"
    }

    return transformed

def login(api_url: str) -> str:
    """Get auth token"""
    response = requests.post(f"{api_url}/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    if response.status_code != 200:
        raise Exception(f"Login failed: {response.text}")
    return response.json()["access_token"]

def create_plant(api_url: str, token: str, plant_data: Dict) -> requests.Response:
    """Create plant via API"""
    headers = {"Authorization": f"Bearer {token}"}
    return requests.post(
        f"{api_url}/farm/plant-data-enhanced",
        json=plant_data,
        headers=headers
    )

def main(use_remote: bool = False, dry_run: bool = False):
    api_url = REMOTE_API_URL if use_remote else LOCAL_API_URL

    # Load source data
    with open("json_exports/standard_planning.json", "r") as f:
        source_data = json.load(f)

    print(f"Loaded {len(source_data)} records from standard_planning.json")

    # Transform all plants
    plants = []
    for record in source_data:
        transformed = transform_plant(record)
        if transformed:
            plants.append(transformed)

    print(f"Transformed {len(plants)} plants (excluding Empty)")

    if dry_run:
        # Save transformed data for review
        with open("tayeb_plants_transformed.json", "w") as f:
            json.dump(plants, f, indent=2)
        print("Dry run - saved to tayeb_plants_transformed.json")
        return

    # Login and create plants
    token = login(api_url)
    print(f"Logged in to {api_url}")

    success = 0
    errors = 0

    for i, plant in enumerate(plants, 1):
        response = create_plant(api_url, token, plant)

        if response.status_code in (200, 201):
            print(f"[{i:2}/{len(plants)}] ✅ {plant['plantName']}")
            success += 1
        else:
            print(f"[{i:2}/{len(plants)}] ❌ {plant['plantName']}")
            print(f"    Error: {response.text[:200]}")
            errors += 1

    print(f"\n{'='*50}")
    print(f"Migration Complete: {success} success, {errors} errors")

if __name__ == "__main__":
    import sys
    use_remote = "--remote" in sys.argv
    dry_run = "--dry-run" in sys.argv
    main(use_remote=use_remote, dry_run=dry_run)
```

---

## Phase 3: Execution Plan

### 3.1 Pre-Migration Checklist

- [ ] Add `contributor` and `targetRegion` fields to backend model
- [ ] Add `contributor` and `targetRegion` to frontend types
- [ ] Deploy schema changes to remote server
- [ ] Test migration script locally with `--dry-run` flag
- [ ] Review transformed data in `tayeb_plants_transformed.json`
- [ ] Create backup of remote database

### 3.2 Step-by-Step Execution

**Step 1: Update Backend Schema**
```bash
# Edit src/modules/farm_manager/models/plant_data_enhanced.py
# Add contributor and targetRegion fields
```

**Step 2: Update Frontend Types**
```bash
# Edit frontend/user-portal/src/types/farm.ts
# Add contributor and targetRegion to interfaces
```

**Step 3: Test Locally**
```bash
cd OldData
python3 migrate_tayeb_standard_planning.py --dry-run
# Review tayeb_plants_transformed.json

# Test with local API
python3 migrate_tayeb_standard_planning.py
```

**Step 4: Deploy to Remote**
```bash
# Local: Commit and push changes
git add .
git commit -m "feat(plant-data): add contributor and targetRegion fields for Tayeb data migration"
git push origin main

# Remote: Pull and rebuild
ssh -i a64-platform-key.pem ubuntu@51.112.224.227
cd ~/A64CorePlatform
git pull origin main
docker compose -f docker-compose.yml -f docker-compose.prod.yml build api
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d api
```

**Step 5: Run Migration on Remote**
```bash
# From local machine, run against remote API
cd OldData
python3 migrate_tayeb_standard_planning.py --remote
```

**Step 6: Verify Migration**
```bash
# Check plant count
curl -s "https://a64core.com/api/v1/farm/plant-data-enhanced?search=-Tayeb&perPage=100" \
  -H "Authorization: Bearer $TOKEN" | jq '.meta.total'

# Verify sample plant
curl -s "https://a64core.com/api/v1/farm/plant-data-enhanced?search=Tomato-Tayeb" \
  -H "Authorization: Bearer $TOKEN" | jq '.data[0] | {plantName, contributor, targetRegion}'
```

### 3.3 Rollback Plan

If migration fails or needs to be reversed:

```python
#!/usr/bin/env python3
"""Rollback script - delete all Tayeb plants"""

import requests

API_URL = "https://a64core.com/api/v1"
TOKEN = "your-token-here"

headers = {"Authorization": f"Bearer {TOKEN}"}

# Get all Tayeb plants
response = requests.get(
    f"{API_URL}/farm/plant-data-enhanced?search=-Tayeb&perPage=100",
    headers=headers
)
plants = response.json().get("data", [])

print(f"Found {len(plants)} Tayeb plants to delete")

for plant in plants:
    if plant["plantName"].endswith("-Tayeb"):
        del_resp = requests.delete(
            f"{API_URL}/farm/plant-data-enhanced/{plant['plantDataId']}",
            headers=headers
        )
        status = "✅" if del_resp.status_code in (200, 204) else "❌"
        print(f"{status} Deleted: {plant['plantName']}")
```

---

## Phase 4: Post-Migration Tasks

### 4.1 Update Existing Plants (Optional)

Add contributor info to existing plants (Tomato, Lettuce, Strawberry):

```python
# Update existing plants with default contributor
existing_updates = [
    {"plantName": "Tomato", "contributor": "A64 Platform", "targetRegion": "Global"},
    {"plantName": "Lettuce", "contributor": "A64 Platform", "targetRegion": "Global"},
    {"plantName": "Strawberry", "contributor": "A64 Platform", "targetRegion": "Global"},
]
```

### 4.2 UI Enhancements (Optional)

- Add contributor badge to plant cards
- Add targetRegion filter to plant library
- Show contributor in plant detail view

---

## Summary

| Phase | Task | Status |
|-------|------|--------|
| 1.1 | Backend schema: add contributor, targetRegion | Pending |
| 1.2 | Frontend types: add contributor, targetRegion | Pending |
| 2.1 | Create migration script | Plan Complete |
| 3.1 | Test locally with --dry-run | Pending |
| 3.2 | Deploy to remote | Pending |
| 3.3 | Run migration | Pending |
| 3.4 | Verify migration | Pending |

**Plants to Migrate**: ~56 (excluding "Empty")
**New Fields**: `contributor`, `targetRegion`
**Naming Convention**: `{PlantName}-Tayeb`

---

## Questions to Confirm Before Proceeding

1. **Plant Naming**: Is `{PlantName}-Tayeb` format correct? (e.g., "Red Long Chili-Tayeb")

2. **Duplicate Handling**: Some plants may have similar names to existing data. Options:
   - Keep as separate entries (recommended - different data source)
   - Skip if exists
   - Merge/update existing

3. **Scientific Names**: The source data doesn't include scientific names. Options:
   - Lookup and add (will do partial matching)
   - Set to "Species TBD" and update later
   - Leave empty

4. **Target Region**: Use "UAE" or "United Arab Emirates"?

5. **Frontend Display**: Show contributor and targetRegion in UI?
   - On plant cards in library view?
   - In plant detail/view modal?
   - As filter options?

---

## Ready to Proceed?

Once you confirm the above questions, I will:
1. Implement the schema changes (backend + frontend)
2. Create the migration script
3. Test locally
4. Deploy and run on remote server
