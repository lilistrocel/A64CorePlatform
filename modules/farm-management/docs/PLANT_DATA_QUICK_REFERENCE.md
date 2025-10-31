# Plant Data Enhanced Schema - Quick Reference

**Last Updated:** 2025-10-31
**Version:** 1.0

---

## 📁 Files Location

```
modules/farm-management/
├── src/models/
│   ├── plant_data_enhanced.py          # Main enhanced schema
│   └── plant_data.py                   # Legacy schema (keep)
├── scripts/
│   └── create_plant_data_indexes.py    # Index creation
└── docs/
    ├── PLANT_DATA_SCHEMA_SUMMARY.md    # Complete documentation
    ├── plant_data_migration_guide.md   # Migration strategy
    ├── plant_data_indexes.md           # Index details
    ├── plant_data_samples.json         # Sample data
    └── PLANT_DATA_QUICK_REFERENCE.md   # This file
```

---

## 🚀 Quick Start

### 1. Import the Schema
```python
from modules.farm_management.src.models.plant_data_enhanced import (
    PlantDataEnhanced,
    PlantDataEnhancedCreate,
    PlantDataEnhancedUpdate,
    FarmTypeEnum,
    GrowthStageEnum
)
```

### 2. Create Plant Data
```python
new_plant = PlantDataEnhancedCreate(
    plantName="Tomato",
    scientificName="Solanum lycopersicum",
    farmTypeCompatibility=[FarmTypeEnum.OPEN_FIELD, FarmTypeEnum.GREENHOUSE],
    growthCycle=GrowthCycleDuration(
        germinationDays=7,
        vegetativeDays=30,
        floweringDays=14,
        fruitingDays=35,
        harvestDurationDays=14,
        totalCycleDays=100
    ),
    # ... other required fields
)
```

### 3. Create Indexes
```bash
python modules/farm-management/scripts/create_plant_data_indexes.py \
  --collection plant_data_enhanced
```

### 4. Query Plant Data
```python
# By ID
plant = await db.plant_data_enhanced.find_one({"plantDataId": plant_id})

# By farm type
plants = await db.plant_data_enhanced.find({
    "farmTypeCompatibility": "hydroponic",
    "deletedAt": None
}).to_list(20)

# Fast-growing crops
plants = await db.plant_data_enhanced.find({
    "growthCycle.totalCycleDays": {"$lte": 60}
}).sort("growthCycle.totalCycleDays", 1).to_list(50)
```

---

## 📊 Schema Structure (13 Categories)

| # | Category | Key Fields |
|---|----------|-----------|
| 1 | Basic Info | `plantName`, `scientificName`, `farmTypeCompatibility` |
| 2 | Growth Cycle | `growthCycle.{germination,vegetative,flowering,fruiting}Days` |
| 3 | Yield | `yieldInfo.{yieldPerPlant,yieldUnit,expectedWastePercentage}` |
| 4 | Fertilizer | `fertilizerSchedule[]` (stage, type, quantity, frequency) |
| 5 | Pesticide | `pesticideSchedule[]` (stage, type, target, safety) |
| 6 | Environment | `environmentalRequirements.{temperature,humidity,co2}` |
| 7 | Watering | `wateringRequirements.{frequencyDays,waterType,amount}` |
| 8 | Soil/pH | `soilRequirements.{phRequirements,soilTypes,nutrients}` |
| 9 | Diseases | `diseasesAndPests[]` (name, symptoms, prevention, treatment) |
| 10 | Light | `lightRequirements.{lightType,hoursDaily,intensity}` |
| 11 | Grading | `gradingStandards[]` (grade, size, color, defects) |
| 12 | Economics | `economicsAndLabor.{marketValue,manHours}` |
| 13 | Additional | `additionalInfo.{growthHabit,spacing,support,companions}` |

---

## 🔍 Key Enums

```python
# Farm Types
FarmTypeEnum: open_field, hydroponic, greenhouse, vertical_farm, aquaponic

# Growth Stages
GrowthStageEnum: germination, vegetative, flowering, fruiting, harvest

# Tolerance Levels
ToleranceLevelEnum: low, medium, high

# Light Types
LightTypeEnum: full_sun, partial_shade, full_shade, filtered_light

# Water Types
WaterTypeEnum: tap, filtered, ro, rainwater, distilled

# Soil Types
SoilTypeEnum: loamy, sandy, clay, silty, peaty, chalky

# Growth Habits
GrowthHabitEnum: determinate, indeterminate, bush, vine, climbing, spreading

# Support Types
SupportTypeEnum: none, trellis, stakes, cage, net, pole
```

---

## 🗂️ Database Indexes (10 Total)

| Index Name | Fields | Type | Purpose |
|------------|--------|------|---------|
| idx_plant_data_plant_data_id | `plantDataId` | Unique | Primary key |
| idx_plant_data_plant_name | `plantName` | Single | Name search |
| idx_plant_data_scientific_name | `scientificName` | Unique, Partial | Unique species |
| idx_plant_data_farm_type_compatibility | `farmTypeCompatibility` | Multikey | Farm type filter |
| idx_plant_data_tags | `tags` | Multikey | Tag search |
| idx_plant_data_growth_cycle_total | `growthCycle.totalCycleDays` | Single | Growth filter |
| idx_plant_data_deleted_at | `deletedAt` | Sparse | Soft delete |
| idx_plant_data_created_by_created_at | `createdBy`, `createdAt` | Compound | User queries |
| idx_plant_data_deleted_at_updated_at | `deletedAt`, `updatedAt` | Compound | Active recent |
| idx_plant_data_text_search | Multiple text fields | Text | Full-text search |

---

## 💾 Common Queries

### Get Plant by ID
```python
plant = await db.plant_data_enhanced.find_one({
    "plantDataId": "550e8400-e29b-41d4-a716-446655440001"
})
```

### Search by Name (Partial Match)
```python
plants = await db.plant_data_enhanced.find({
    "plantName": {"$regex": "^Tom", "$options": "i"},
    "deletedAt": None
}).to_list(20)
```

### Filter by Farm Type
```python
plants = await db.plant_data_enhanced.find({
    "farmTypeCompatibility": "hydroponic",
    "deletedAt": None
}).to_list(100)
```

### Filter by Tags
```python
plants = await db.plant_data_enhanced.find({
    "tags": {"$in": ["vegetable", "fast-growing"]},
    "deletedAt": None
}).to_list(50)
```

### Fast-Growing Crops (≤60 days)
```python
plants = await db.plant_data_enhanced.find({
    "growthCycle.totalCycleDays": {"$lte": 60},
    "deletedAt": None
}).sort("growthCycle.totalCycleDays", 1).to_list(50)
```

### Full-Text Search
```python
plants = await db.plant_data_enhanced.find({
    "$text": {"$search": "tomato heat resistant"}
}).sort({"score": {"$meta": "textScore"}}).to_list(20)
```

### User's Recent Plants
```python
plants = await db.plant_data_enhanced.find({
    "createdBy": user_id,
    "deletedAt": None
}).sort("createdAt", -1).limit(20).to_list(20)
```

### Plants by Multiple Criteria
```python
plants = await db.plant_data_enhanced.find({
    "farmTypeCompatibility": "greenhouse",
    "growthCycle.totalCycleDays": {"$lte": 90},
    "tags": "high-value",
    "deletedAt": None
}).sort("yieldInfo.yieldPerPlant", -1).to_list(50)
```

---

## 🔐 Security Notes

### UUID v4 Primary Keys
```python
plantDataId: UUID = Field(default_factory=uuid4)
# Prevents enumeration attacks
# Example: 550e8400-e29b-41d4-a716-446655440001
```

### Audit Trail
```python
createdBy: UUID        # Who created
createdByEmail: str    # Email for audit
createdAt: datetime    # When created (UTC)
updatedAt: datetime    # Last update (UTC)
deletedAt: datetime    # Soft delete (UTC)
```

### Data Versioning
```python
dataVersion: int = 1
# Increment on updates
# Freeze version when used in planting plans
```

---

## 🧪 Validation Examples

### Growth Cycle Validation
```python
# Total cycle must equal sum of stages
cycle = GrowthCycleDuration(
    germinationDays=7,
    vegetativeDays=30,
    floweringDays=14,
    fruitingDays=35,
    harvestDurationDays=14,
    totalCycleDays=100  # Must equal sum
)
```

### Temperature Range Validation
```python
# Optimal must be within min-max
temp = TemperatureRange(
    minCelsius=15.0,
    maxCelsius=30.0,
    optimalCelsius=24.0  # Must be 15-30
)
```

### pH Range Validation
```python
# pH values must be 0-14
ph = PHRequirements(
    minPH=6.0,    # 0-14
    maxPH=6.8,    # 0-14
    optimalPH=6.5  # Within min-max
)
```

---

## 🎨 Naming Conventions

### MongoDB Standard
- **Collections**: `plant_data`, `farm_blocks` (plural, lowercase, underscores)
- **Fields**: `plantName`, `createdAt` (camelCase)
- **Booleans**: `isActive`, `hasPermission` (is/has prefix)
- **IDs**: `plantDataId`, `userId` (resource + Id)
- **Indexes**: `idx_plant_data_plant_name` (idx_collection_field)

### Always UTC
```python
from datetime import datetime

createdAt = Field(default_factory=datetime.utcnow)  # ✅ Always UTC
updatedAt = Field(default_factory=datetime.utcnow)  # ✅ Always UTC
```

---

## 📦 Sample Data

Three complete samples in `plant_data_samples.json`:
1. **Tomato** - Indeterminate, 100 days, $3.50/kg
2. **Lettuce** - Fast-growing, 35 days, $4.00/kg
3. **Strawberry** - Perennial, 245 days, $8.50/kg

Import:
```bash
mongoimport --db farm_management_db \
  --collection plant_data_enhanced \
  --file modules/farm-management/docs/plant_data_samples.json \
  --jsonArray
```

---

## 🔄 Migration Status

| Phase | Status | Notes |
|-------|--------|-------|
| Schema Design | ✅ Complete | All models defined |
| Index Strategy | ✅ Complete | 10 indexes documented |
| Sample Data | ✅ Complete | 3 plants (tomato, lettuce, strawberry) |
| Migration Guide | ✅ Complete | Zero-downtime approach |
| Mapper Utility | ⏳ TODO | Bidirectional conversion |
| Migration Script | ⏳ TODO | Bulk data migration |
| Validation Script | ⏳ TODO | Data integrity checks |
| API Integration | ⏳ TODO | REST endpoints |

---

## 📚 Documentation Links

| Document | Purpose |
|----------|---------|
| `PLANT_DATA_SCHEMA_SUMMARY.md` | Complete overview and guide |
| `plant_data_migration_guide.md` | Step-by-step migration process |
| `plant_data_indexes.md` | Detailed index documentation |
| `plant_data_samples.json` | Sample data for testing |
| `PLANT_DATA_QUICK_REFERENCE.md` | This quick reference |

---

## ⚡ Performance Tips

1. **Use Projections** - Fetch only needed fields
```python
plant = await db.plant_data_enhanced.find_one(
    {"plantDataId": plant_id},
    {"plantName": 1, "scientificName": 1, "growthCycle": 1}
)
```

2. **Leverage Indexes** - Ensure queries use indexes
```python
# Use explain() to verify index usage
cursor = db.plant_data_enhanced.find({"farmTypeCompatibility": "hydroponic"})
explain = await cursor.explain()
print(explain["executionStats"])
```

3. **Pagination** - Use skip/limit for large result sets
```python
page = 1
page_size = 20
plants = await db.plant_data_enhanced.find({
    "deletedAt": None
}).skip((page - 1) * page_size).limit(page_size).to_list(page_size)
```

4. **Aggregation** - Use for complex queries
```python
pipeline = [
    {"$match": {"deletedAt": None}},
    {"$group": {
        "_id": "$farmTypeCompatibility",
        "count": {"$sum": 1},
        "avgYield": {"$avg": "$yieldInfo.yieldPerPlant"}
    }}
]
results = await db.plant_data_enhanced.aggregate(pipeline).to_list(None)
```

---

## 🐛 Troubleshooting

### Issue: Validation Error
```
ValidationError: Optimal temperature must be between min and max
```
**Fix:** Ensure `optimalCelsius` is within `minCelsius` and `maxCelsius`

### Issue: Index Already Exists
```
OperationFailure: Index with name 'idx_plant_data_plant_name' already exists
```
**Fix:** Drop and recreate, or use script's skip logic

### Issue: UUID as String
```python
# MongoDB stores UUIDs as strings
plant_id_str = str(plant_data.plantDataId)  # Convert to string for queries
```

### Issue: Null vs None in Partial Index
```python
# Partial index on scientificName requires explicit filter
partialFilterExpression={"scientificName": {"$exists": True, "$ne": None}}
```

---

## 📞 Need Help?

- **Full Documentation**: See `PLANT_DATA_SCHEMA_SUMMARY.md`
- **Migration Guide**: See `plant_data_migration_guide.md`
- **Index Details**: See `plant_data_indexes.md`
- **Sample Data**: See `plant_data_samples.json`

---

**Quick Reference v1.0 | Last Updated: 2025-10-31**
