# Plant Data Enhanced Schema - Visual Diagram

## Document Structure Overview

```
PlantDataEnhanced
│
├─── Identification & Metadata
│    ├── plantDataId (UUID v4)
│    ├── plantName (string)
│    ├── scientificName (string)
│    ├── farmTypeCompatibility (enum[])
│    ├── tags (string[])
│    ├── dataVersion (int)
│    ├── createdBy (UUID)
│    ├── createdByEmail (string)
│    ├── createdAt (datetime UTC)
│    ├── updatedAt (datetime UTC)
│    └── deletedAt (datetime UTC | null)
│
├─── Growth Cycle (embedded document)
│    ├── germinationDays (int)
│    ├── vegetativeDays (int)
│    ├── floweringDays (int)
│    ├── fruitingDays (int)
│    ├── harvestDurationDays (int)
│    └── totalCycleDays (int) [validated sum]
│
├─── Yield Information (embedded document)
│    ├── yieldPerPlant (float)
│    ├── yieldUnit (string)
│    └── expectedWastePercentage (float)
│
├─── Fertilizer Schedule (array of documents)
│    └── FertilizerApplication[]
│         ├── stage (enum: germination, vegetative, flowering, fruiting)
│         ├── fertilizerType (string)
│         ├── quantityPerPlant (float)
│         ├── quantityUnit (string)
│         ├── frequencyDays (int)
│         ├── npkRatio (string | null)
│         └── notes (string | null)
│
├─── Pesticide Schedule (array of documents)
│    └── PesticideApplication[]
│         ├── stage (enum: germination, vegetative, flowering, fruiting)
│         ├── pesticideType (string)
│         ├── targetPest (string | null)
│         ├── quantityPerPlant (float)
│         ├── quantityUnit (string)
│         ├── frequencyDays (int)
│         ├── safetyNotes (string | null)
│         └── preharvestIntervalDays (int | null)
│
├─── Environmental Requirements (embedded document)
│    ├── temperature (embedded document)
│    │    ├── minCelsius (float)
│    │    ├── maxCelsius (float)
│    │    └── optimalCelsius (float) [validated within min-max]
│    ├── humidity (embedded document | null)
│    │    ├── minPercentage (float)
│    │    ├── maxPercentage (float)
│    │    └── optimalPercentage (float)
│    ├── co2RequirementPpm (int | null)
│    └── airCirculation (string | null)
│
├─── Watering Requirements (embedded document)
│    ├── frequencyDays (int)
│    ├── waterType (enum: tap, filtered, ro, rainwater, distilled)
│    ├── amountPerPlantLiters (float | null)
│    ├── droughtTolerance (enum: low, medium, high)
│    └── notes (string | null)
│
├─── Soil Requirements (embedded document)
│    ├── phRequirements (embedded document)
│    │    ├── minPH (float, 0-14)
│    │    ├── maxPH (float, 0-14)
│    │    └── optimalPH (float, 0-14)
│    ├── soilTypes (enum[]: loamy, sandy, clay, silty, peaty, chalky)
│    ├── nutrientsRecommendations (string | null)
│    ├── ecRangeMs (string | null)
│    ├── tdsRangePpm (string | null)
│    └── notes (string | null)
│
├─── Diseases & Pests (array of documents)
│    └── DiseaseOrPest[]
│         ├── name (string)
│         ├── symptoms (string)
│         ├── preventionMeasures (string)
│         ├── treatmentOptions (string)
│         └── severity (enum: low, medium, high, critical)
│
├─── Light Requirements (embedded document)
│    ├── lightType (enum: full_sun, partial_shade, full_shade, filtered_light)
│    ├── minHoursDaily (float, 0-24)
│    ├── maxHoursDaily (float, 0-24)
│    ├── optimalHoursDaily (float, 0-24)
│    ├── intensityLux (int | null)
│    ├── intensityPpfd (int | null)
│    ├── photoperiodSensitive (bool)
│    └── notes (string | null)
│
├─── Grading Standards (array of documents)
│    └── QualityGrade[]
│         ├── gradeName (string)
│         ├── sizeRequirements (string | null)
│         ├── colorRequirements (string | null)
│         ├── defectTolerance (string | null)
│         ├── otherCriteria (string | null)
│         └── priceMultiplier (float | null)
│
├─── Economics & Labor (embedded document)
│    ├── averageMarketValuePerKg (float | null)
│    ├── currency (string)
│    ├── totalManHoursPerPlant (float)
│    ├── plantingHours (float | null)
│    ├── maintenanceHours (float | null)
│    ├── harvestingHours (float | null)
│    └── notes (string | null)
│
└─── Additional Information (embedded document)
     ├── growthHabit (enum: determinate, indeterminate, bush, vine, climbing, spreading)
     ├── spacing (embedded document)
     │    ├── betweenPlantsCm (float)
     │    ├── betweenRowsCm (float)
     │    └── plantsPerSquareMeter (float | null)
     ├── supportRequirements (enum: none, trellis, stakes, cage, net, pole)
     ├── companionPlants (string[] | null)
     ├── incompatiblePlants (string[] | null)
     └── notes (string | null)
```

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     PLANT DATA LIFECYCLE                        │
└─────────────────────────────────────────────────────────────────┘

1. CREATE
   ┌──────────────┐
   │ Agronomist   │
   │ Creates New  │
   │ Plant Data   │
   └──────┬───────┘
          │
          v
   ┌──────────────────────┐
   │ Validation           │
   │ - Required fields    │
   │ - Data types         │
   │ - Range checks       │
   │ - Enum validation    │
   └──────┬───────────────┘
          │
          v
   ┌──────────────────────┐
   │ MongoDB Insert       │
   │ - Generate UUID      │
   │ - Set timestamps     │
   │ - Version = 1        │
   └──────┬───────────────┘
          │
          v
   ┌──────────────────────┐
   │ Indexed in DB        │
   │ - 10 indexes         │
   │ - Full-text search   │
   └──────────────────────┘

2. QUERY
   ┌──────────────┐
   │ User Search  │
   │ - By name    │
   │ - By type    │
   │ - By tags    │
   └──────┬───────┘
          │
          v
   ┌──────────────────────┐
   │ Index Lookup         │
   │ - Fast retrieval     │
   │ - Filter deleted     │
   └──────┬───────────────┘
          │
          v
   ┌──────────────────────┐
   │ Return Results       │
   │ - Sorted             │
   │ - Paginated          │
   └──────────────────────┘

3. USE IN PLANTING PLAN
   ┌──────────────┐
   │ Select Plant │
   │ for Farm     │
   │ Block        │
   └──────┬───────┘
          │
          v
   ┌──────────────────────┐
   │ FREEZE Version       │
   │ - Copy data snapshot │
   │ - Lock version #     │
   └──────┬───────────────┘
          │
          v
   ┌──────────────────────┐
   │ Planting Plan        │
   │ - Uses frozen data   │
   │ - Independent of     │
   │   future updates     │
   └──────────────────────┘

4. UPDATE
   ┌──────────────┐
   │ Agronomist   │
   │ Updates Data │
   └──────┬───────┘
          │
          v
   ┌──────────────────────┐
   │ Increment Version    │
   │ - version += 1       │
   │ - Update timestamp   │
   └──────┬───────────────┘
          │
          v
   ┌──────────────────────┐
   │ New Version Saved    │
   │ - Old plans use v1   │
   │ - New plans use v2   │
   └──────────────────────┘

5. DELETE (Soft)
   ┌──────────────┐
   │ Admin Marks  │
   │ Obsolete     │
   └──────┬───────┘
          │
          v
   ┌──────────────────────┐
   │ Set deletedAt        │
   │ - Timestamp          │
   │ - Not removed        │
   └──────┬───────────────┘
          │
          v
   ┌──────────────────────┐
   │ Hidden from Search   │
   │ - Existing plans OK  │
   │ - Can be restored    │
   └──────────────────────┘
```

---

## Index Coverage Map

```
┌─────────────────────────────────────────────────────────────────┐
│                       INDEX STRATEGY                            │
└─────────────────────────────────────────────────────────────────┘

QUERY TYPE                          INDEX USED                      PERFORMANCE
────────────────────────────────────────────────────────────────────────────────
Get by ID                           idx_plant_data_plant_data_id    O(1) - Unique
plantDataId lookup                  (UNIQUE)                        Direct lookup

Search by Name                      idx_plant_data_plant_name       O(log n)
plantName = "Tomato"                (SINGLE FIELD)                  Index scan

Unique Scientific Name              idx_plant_data_scientific_name  O(1) - Unique
scientificName check                (UNIQUE, PARTIAL)               Enforces unique

Filter by Farm Type                 idx_plant_data_farm_type_       O(log n)
farmTypeCompatibility = "hydro"     compatibility (MULTIKEY)        Array scan

Tag-based Search                    idx_plant_data_tags             O(log n)
tags $in ["vegetable"]              (MULTIKEY)                      Array scan

Fast-growing Filter                 idx_plant_data_growth_cycle_    O(log n)
growthCycle.totalCycleDays <= 60    total (EMBEDDED FIELD)          Range scan

Active Records Only                 idx_plant_data_deleted_at       O(log n)
deletedAt = null                    (SPARSE)                        Sparse index

User's Plants                       idx_plant_data_created_by_      O(log n)
createdBy + sort by createdAt       created_at (COMPOUND)           Covered query

Recent Active Updates               idx_plant_data_deleted_at_      O(log n)
deletedAt + sort by updatedAt       updated_at (COMPOUND)           Compound scan

Full-Text Search                    idx_plant_data_text_search      O(n) subset
$text search multiple fields        (TEXT, WEIGHTED)                Relevance rank
```

---

## Data Relationships

```
┌─────────────────────────────────────────────────────────────────┐
│                    ENTITY RELATIONSHIPS                         │
└─────────────────────────────────────────────────────────────────┘

                        ┌─────────────────┐
                        │   USER          │
                        │  (Agronomist)   │
                        └────────┬────────┘
                                 │ creates/updates
                                 │ (createdBy)
                                 v
                        ┌─────────────────┐
                        │  PLANT DATA     │◄───────────────┐
                        │  (Enhanced)     │                │
                        └────────┬────────┘                │
                                 │                         │
                                 │ used in                 │
                                 │ (snapshot + version)    │
                                 v                         │
                        ┌─────────────────┐                │
                        │ PLANTING PLAN   │                │
                        │  (Block)        │                │
                        └────────┬────────┘                │
                                 │                         │
                                 │ references              │
                                 │ (farmBlockId)           │
                                 v                         │
                        ┌─────────────────┐                │
                        │  FARM BLOCK     │                │
                        │                 │                │
                        └─────────────────┘                │
                                                            │
                        ┌─────────────────┐                │
                        │  FARM           │                │
                        │                 │                │
                        └────────┬────────┘                │
                                 │ has farm type           │
                                 │ (farmType)              │
                                 └─────────────────────────┘
                                   filters plant data
                                   by compatibility
```

---

## MongoDB Collection Layout

```
farm_management_db
│
├── plant_data_enhanced (main collection)
│   ├── Documents: ~1,000-10,000 plant varieties
│   ├── Size per doc: ~5-15 KB (comprehensive data)
│   ├── Total size: ~5-150 MB
│   ├── Indexes: 10 indexes (~15-25% overhead)
│   └── Growth: Slow (occasional new plants)
│
├── farms
│   └── References plant compatibility via farmType
│
├── farm_blocks
│   └── Uses plant data in planting plans
│
├── planting_schedules
│   ├── Embeds frozen plant data snapshot
│   └── Stores dataVersion for reference
│
└── users
    └── createdBy references userId
```

---

## Field Type Legend

```
TYPE                EXAMPLE                         NOTES
────────────────────────────────────────────────────────────────────
UUID                550e8400-e29b-41d4-...         UUID v4 (string in MongoDB)
string              "Tomato"                        UTF-8 text
int                 100                             Integer number
float               5.5                             Decimal number
bool                true / false                    Boolean
datetime            2025-01-15T10:00:00Z            ISO 8601 UTC
enum                "hydroponic"                    Predefined values
string[]            ["tag1", "tag2"]                Array of strings
enum[]              ["open_field", "greenhouse"]    Array of enums
Document            { field: value }                Embedded document
Document[]          [{ field: value }, ...]         Array of documents
string | null       "value" or null                 Optional field
```

---

## Validation Rules Summary

```
FIELD                           VALIDATION
──────────────────────────────────────────────────────────────────
plantDataId                     UUID v4, unique
plantName                       Required, 1-200 chars
scientificName                  Required, unique (if not null)
farmTypeCompatibility           Required, array of enums
growthCycle.totalCycleDays      Sum of all stage days (validated)
yieldInfo.yieldPerPlant         Required, > 0
yieldInfo.expectedWaste%        0-100
temperature.optimalCelsius      Within min-max range (validated)
humidity.*Percentage            0-100
phRequirements.*PH              0-14
lightRequirements.*HoursDaily   0-24
fertilizerSchedule[].quantity   > 0
pesticideSchedule[].quantity    > 0
economicsAndLabor.manHours      >= 0
spacing.betweenPlants/RowsCm    > 0
dataVersion                     >= 1, auto-increment
createdAt, updatedAt            UTC datetime, auto-set
deletedAt                       UTC datetime or null
```

---

## Sample Document (Condensed)

```json
{
  "plantDataId": "550e8400-e29b-41d4-a716-446655440001",
  "plantName": "Tomato",
  "scientificName": "Solanum lycopersicum",
  "farmTypeCompatibility": ["open_field", "greenhouse", "hydroponic"],
  "growthCycle": {
    "germinationDays": 7,
    "vegetativeDays": 30,
    "floweringDays": 14,
    "fruitingDays": 35,
    "harvestDurationDays": 14,
    "totalCycleDays": 100
  },
  "yieldInfo": {
    "yieldPerPlant": 5.0,
    "yieldUnit": "kg",
    "expectedWastePercentage": 10.0
  },
  "fertilizerSchedule": [
    {
      "stage": "vegetative",
      "fertilizerType": "NPK 20-10-10",
      "quantityPerPlant": 50.0,
      "quantityUnit": "grams",
      "frequencyDays": 14,
      "npkRatio": "20-10-10",
      "notes": "Apply around base"
    }
  ],
  "environmentalRequirements": {
    "temperature": {
      "minCelsius": 15.0,
      "maxCelsius": 30.0,
      "optimalCelsius": 24.0
    }
  },
  "tags": ["vegetable", "fruit", "summer", "high-value"],
  "dataVersion": 1,
  "createdBy": "550e8400-e29b-41d4-a716-446655440099",
  "createdByEmail": "agronomist@farmtech.com",
  "createdAt": "2025-01-15T10:00:00Z",
  "updatedAt": "2025-01-15T10:00:00Z",
  "deletedAt": null
}
```

---

## Size Estimates

```
COMPONENT                       SIZE ESTIMATE
───────────────────────────────────────────────────────────────
Single plant document           5-15 KB (comprehensive)
1,000 plant varieties           5-15 MB
10,000 plant varieties          50-150 MB

Indexes overhead                15-25% of collection size
Total with indexes              ~60-190 MB (10k plants)

Growth rate                     ~10-50 new plants/month
Storage growth                  ~50-750 KB/month
```

---

## Performance Characteristics

```
OPERATION                       EXPECTED PERFORMANCE
───────────────────────────────────────────────────────────────
Get by ID                       < 5ms (indexed)
Search by name                  < 20ms (indexed)
Filter by farm type             < 30ms (multikey index)
Full-text search                < 100ms (text index)
Create new plant                < 50ms (write + index update)
Update plant                    < 75ms (write + 10 index updates)
Bulk migration (1000 plants)    < 60 seconds
List with pagination (20)       < 15ms (covered query)
```

---

**Diagram v1.0 | Last Updated: 2025-10-31**
