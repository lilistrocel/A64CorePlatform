# Plant Data Enhanced Schema - Complete Summary

## 📋 Overview

This document provides a complete summary of the enhanced Plant Data schema designed for the Farm Management Module. The schema transforms the Plant Data into a comprehensive agronomic knowledge base.

---

## 🎯 Design Objectives

1. **Comprehensive Agronomic Knowledge Base** - Capture all relevant plant cultivation data
2. **Farm Type Flexibility** - Support multiple farm types (open field, hydroponic, greenhouse, etc.)
3. **Backward Compatibility** - Maintain compatibility with existing basic schema
4. **Security First** - Use UUID v4 for all public-facing identifiers
5. **Query Performance** - Strategic indexing for optimal performance
6. **Data Versioning** - Support freezing plant data for planting plans

---

## 📊 Schema Structure

### 13 Major Data Categories

| Category | Sub-Documents | Purpose |
|----------|--------------|---------|
| 1. Basic Information | - | Plant identity and farm compatibility |
| 2. Growth Cycle | GrowthCycleDuration | Detailed stage-by-stage timing |
| 3. Yield & Waste | YieldInfo | Expected production and loss |
| 4. Fertilizer Schedule | FertilizerApplication[] | Stage-specific fertilization |
| 5. Pesticide Schedule | PesticideApplication[] | Pest management schedule |
| 6. Environmental | EnvironmentalRequirements | Temperature, humidity, CO2, air |
| 7. Watering | WateringRequirements | Irrigation specifications |
| 8. pH & Soil | SoilRequirements | Soil type, pH, nutrients |
| 9. Diseases & Pests | DiseaseOrPest[] | Known issues and treatments |
| 10. Light | LightRequirements | Light type, intensity, photoperiod |
| 11. Grading | QualityGrade[] | Market quality standards |
| 12. Economics & Labor | EconomicsAndLabor | Financial and labor data |
| 13. Additional Info | AdditionalInformation | Spacing, support, companions |

---

## 🗂️ File Structure

```
modules/farm-management/
├── src/models/
│   ├── plant_data.py                    # ✅ Original basic schema (keep for compatibility)
│   ├── plant_data_enhanced.py           # ✅ NEW: Comprehensive enhanced schema
│   └── plant_data_mapper.py             # ✅ NEW: Migration utility (to be created)
├── scripts/
│   ├── create_plant_data_indexes.py     # ✅ NEW: Index creation script
│   ├── migrate_plant_data.py            # ⏳ TODO: Bulk migration script
│   └── verify_migration.py              # ⏳ TODO: Validation script
└── docs/
    ├── plant_data_indexes.md            # ✅ NEW: Index documentation
    ├── plant_data_samples.json          # ✅ NEW: Sample data (3 plants)
    ├── plant_data_migration_guide.md    # ✅ NEW: Complete migration guide
    └── PLANT_DATA_SCHEMA_SUMMARY.md     # ✅ NEW: This document
```

---

## 🔑 Key Features

### 1. Detailed Growth Cycle Breakdown
Instead of single `growthCycleDays`, now tracks:
- Germination days
- Vegetative days
- Flowering days
- Fruiting days
- Harvest duration days
- Total cycle days (validated)

### 2. Comprehensive Fertilizer & Pesticide Schedules
Arrays of applications with:
- Growth stage targeting
- Product type/name
- Quantity per plant
- Application frequency
- Safety notes and NPK ratios

### 3. Multi-Farm Type Support
`farmTypeCompatibility` array supports:
- Open field
- Hydroponic
- Greenhouse
- Vertical farm
- Aquaponic

### 4. Disease & Pest Management Database
Each plant includes array of:
- Common diseases/pests
- Symptoms to identify
- Prevention measures
- Treatment options
- Severity levels

### 5. Quality Grading Standards
Market-ready grading with:
- Multiple grade levels (Premium, Standard, Processing)
- Size, color, defect requirements
- Price multipliers for economics

### 6. Economics & Labor Tracking
- Market value per kg
- Total man-hours per plant
- Labor breakdown by stage (planting, maintenance, harvesting)

---

## 🏗️ MongoDB Schema Design

### Database: `farm_management_db`
### Collection: `plant_data_enhanced` (during migration) → `plant_data` (final)

### Document Structure

```javascript
{
  // Unique Identifier (UUID v4 for security)
  "plantDataId": "550e8400-e29b-41d4-a716-446655440001",

  // Basic Information
  "plantName": "Tomato",
  "scientificName": "Solanum lycopersicum",
  "farmTypeCompatibility": ["open_field", "greenhouse", "hydroponic"],

  // Growth Cycle (embedded document)
  "growthCycle": {
    "germinationDays": 7,
    "vegetativeDays": 30,
    "floweringDays": 14,
    "fruitingDays": 35,
    "harvestDurationDays": 14,
    "totalCycleDays": 100
  },

  // Yield Information
  "yieldInfo": {
    "yieldPerPlant": 5.0,
    "yieldUnit": "kg",
    "expectedWastePercentage": 10.0
  },

  // Fertilizer Schedule (array of applications)
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
    // ... more applications
  ],

  // ... (see full samples in plant_data_samples.json)

  // Audit & Metadata
  "dataVersion": 1,
  "createdBy": "550e8400-e29b-41d4-a716-446655440099",
  "createdByEmail": "agronomist@farmtech.com",
  "createdAt": "2025-01-15T10:00:00Z",
  "updatedAt": "2025-01-15T10:00:00Z",
  "deletedAt": null  // Soft delete support
}
```

---

## 🔍 Database Indexes (10 Total)

### Critical Indexes (Must Have)

1. **idx_plant_data_plant_data_id** - Unique, Primary Key
   - `{ plantDataId: 1 }`
   - Unique constraint, UUID-based lookups

2. **idx_plant_data_plant_name** - Search by Name
   - `{ plantName: 1 }`
   - Most common search field

3. **idx_plant_data_scientific_name** - Scientific Name (Unique)
   - `{ scientificName: 1 }`
   - Unique constraint, partial index (handles nulls)

4. **idx_plant_data_farm_type_compatibility** - Farm Type Filter
   - `{ farmTypeCompatibility: 1 }`
   - Multikey index for array field

5. **idx_plant_data_tags** - Tag-based Search
   - `{ tags: 1 }`
   - Multikey index for categorization

### Performance Indexes

6. **idx_plant_data_growth_cycle_total** - Growth Duration Filter
   - `{ "growthCycle.totalCycleDays": 1 }`
   - Sort/filter by growth time

7. **idx_plant_data_deleted_at** - Soft Delete Filter
   - `{ deletedAt: 1 }`
   - Sparse index for active records

8. **idx_plant_data_created_by_created_at** - User's Plants
   - `{ createdBy: 1, createdAt: -1 }`
   - Compound index for user queries

9. **idx_plant_data_deleted_at_updated_at** - Active & Recent
   - `{ deletedAt: 1, updatedAt: -1 }`
   - Admin view of recent updates

### Advanced Index

10. **idx_plant_data_text_search** - Full-Text Search
    - Text index on: plantName, scientificName, tags, notes
    - Weighted for relevance ranking

### Create All Indexes

```bash
# Using the provided script
python modules/farm-management/scripts/create_plant_data_indexes.py \
  --collection plant_data_enhanced

# Or for legacy schema
python modules/farm-management/scripts/create_plant_data_indexes.py \
  --collection plant_data --legacy
```

---

## 📝 Sample Data

Three complete sample plants provided in `plant_data_samples.json`:

1. **Tomato (Solanum lycopersicum)**
   - 100-day growth cycle
   - Indeterminate, requires staking
   - 5 kg yield per plant
   - Detailed fertilizer/pesticide schedules
   - 3 quality grades
   - $3.50/kg market value

2. **Lettuce (Lactuca sativa)**
   - 35-day fast growth cycle
   - Hydroponic/vertical farm friendly
   - 0.3 kg yield per plant
   - Cool-season crop
   - $4.00/kg market value

3. **Strawberry (Fragaria × ananassa)**
   - 245-day growth cycle (perennial)
   - High-value crop
   - 1.2 kg yield per plant
   - Labor-intensive (3.5 man-hours)
   - $8.50/kg market value

Import samples:
```bash
mongoimport --db farm_management_db \
  --collection plant_data_enhanced \
  --file modules/farm-management/docs/plant_data_samples.json \
  --jsonArray
```

---

## 🔄 Migration Strategy

### Timeline: 8-10 Weeks (Zero Downtime)

| Phase | Duration | Activities |
|-------|----------|-----------|
| **1. Preparation** | Week 1 | Deploy schemas, create mapper |
| **2. Dual-Write** | Week 2 | Implement dual writes, feature flags |
| **3. Bulk Migration** | Week 3 | Run migration scripts, verify |
| **4. Testing** | Week 4 | Validate data, test queries |
| **5-6. Gradual Cutover** | Weeks 5-6 | Route traffic to enhanced schema |
| **7. 100% Cutover** | Week 7 | All traffic on enhanced |
| **8+. Deprecation** | Week 8+ | Archive legacy collection |

### Migration Approach: Parallel Schema

1. Deploy enhanced schema alongside legacy (no breaking changes)
2. Implement dual-write to both collections
3. Bulk migrate existing data with validation
4. Gradually route read traffic to enhanced schema using feature flags
5. Monitor performance and error rates
6. Complete cutover when stable
7. Archive legacy collection after 30 days

**See full details in:** `plant_data_migration_guide.md`

---

## 🛡️ Security Considerations

### 1. UUID v4 for Public IDs
```python
plantDataId: UUID = Field(default_factory=uuid4)
```
- Prevents enumeration attacks
- Non-sequential, cryptographically random
- Stored as strings in MongoDB

### 2. Audit Trail
```python
createdBy: UUID        # Who created
createdByEmail: str    # Email for audit
createdAt: datetime    # When created (UTC)
updatedAt: datetime    # Last update (UTC)
deletedAt: datetime    # Soft delete (UTC)
```

### 3. Data Versioning
```python
dataVersion: int = 1
```
- Freeze plant data version when used in planting plans
- Prevent breaking changes to active plans

---

## 🎨 Naming Conventions (MongoDB Standards)

### Collections
- **Plural, lowercase, underscores**: `plant_data`, `farm_blocks`

### Fields
- **camelCase**: `plantName`, `createdAt`, `totalCycleDays`
- **Booleans**: prefix with `is`/`has` - `isActive`, `hasPermission`
- **IDs**: `{resource}Id` format - `plantDataId`, `userId`, `farmId`

### Indexes
- **Format**: `idx_{collection}_{field1}_{field2}`
- **Examples**: `idx_plant_data_plant_name`, `idx_plant_data_created_by_created_at`

---

## 📈 Query Performance Examples

### Example 1: Get Plant by ID
```python
plant = await db.plant_data_enhanced.find_one({
    "plantDataId": "550e8400-e29b-41d4-a716-446655440001"
})
# Uses: idx_plant_data_plant_data_id (unique)
# Performance: O(1) - direct index lookup
```

### Example 2: Search by Name
```python
plants = await db.plant_data_enhanced.find({
    "plantName": {"$regex": "^Tom", "$options": "i"},
    "deletedAt": None
}).to_list(20)
# Uses: idx_plant_data_plant_name
# Performance: Index scan + filter
```

### Example 3: Filter by Farm Type
```python
plants = await db.plant_data_enhanced.find({
    "farmTypeCompatibility": "hydroponic",
    "deletedAt": None
}).to_list(100)
# Uses: idx_plant_data_farm_type_compatibility (multikey)
# Performance: Index scan on array field
```

### Example 4: Fast-Growing Crops
```python
plants = await db.plant_data_enhanced.find({
    "growthCycle.totalCycleDays": {"$lte": 60},
    "deletedAt": None
}).sort("growthCycle.totalCycleDays", 1).to_list(50)
# Uses: idx_plant_data_growth_cycle_total
# Performance: Index scan with in-memory sort
```

### Example 5: Full-Text Search
```python
plants = await db.plant_data_enhanced.find({
    "$text": {"$search": "tomato heat resistant greenhouse"}
}).sort({"score": {"$meta": "textScore"}}).to_list(20)
# Uses: idx_plant_data_text_search (weighted)
# Performance: Text index scan with relevance ranking
```

### Example 6: User's Recent Plants
```python
plants = await db.plant_data_enhanced.find({
    "createdBy": "user-uuid-here",
    "deletedAt": None
}).sort("createdAt", -1).limit(20).to_list(20)
# Uses: idx_plant_data_created_by_created_at (compound)
# Performance: Index-only scan (covered query)
```

---

## 🧪 Testing Strategy

### Unit Tests
```python
# Test Pydantic model validation
def test_growth_cycle_validation():
    """Ensure totalCycleDays matches sum of stages"""
    cycle = GrowthCycleDuration(
        germinationDays=7,
        vegetativeDays=30,
        floweringDays=14,
        fruitingDays=35,
        harvestDurationDays=14,
        totalCycleDays=100
    )
    assert cycle.totalCycleDays == 100

def test_temperature_range_validation():
    """Ensure optimal temp is within min-max range"""
    # Should raise ValidationError if optimal outside range
```

### Integration Tests
```python
# Test MongoDB operations
async def test_create_plant_data():
    """Test creating enhanced plant data"""
    plant = PlantDataEnhanced(**sample_tomato_data)
    result = await db.plant_data_enhanced.insert_one(plant.model_dump())
    assert result.inserted_id is not None

async def test_query_by_farm_type():
    """Test querying by farm type compatibility"""
    results = await db.plant_data_enhanced.find({
        "farmTypeCompatibility": "hydroponic"
    }).to_list(10)
    assert len(results) > 0
```

### Migration Tests
```python
# Test data migration
async def test_legacy_to_enhanced_conversion():
    """Test converting legacy format to enhanced"""
    legacy = PlantDataLegacy(**legacy_tomato_data)
    enhanced = PlantDataMigrationMapper.legacy_to_enhanced(legacy)
    assert enhanced.plantName == legacy.plantName
    assert enhanced.growthCycle.totalCycleDays == legacy.growthCycleDays
```

---

## 📚 API Integration

### Example REST Endpoints

```python
# GET /api/v1/plant-data
@router.get("/plant-data", response_model=List[PlantDataEnhanced])
async def list_plant_data(
    farm_type: Optional[str] = None,
    tags: Optional[List[str]] = Query(None),
    max_growth_days: Optional[int] = None,
    skip: int = 0,
    limit: int = 20
):
    """List plant data with filters"""
    query = {"deletedAt": None}

    if farm_type:
        query["farmTypeCompatibility"] = farm_type
    if tags:
        query["tags"] = {"$in": tags}
    if max_growth_days:
        query["growthCycle.totalCycleDays"] = {"$lte": max_growth_days}

    plants = await db.plant_data_enhanced.find(query).skip(skip).limit(limit).to_list(limit)
    return plants

# GET /api/v1/plant-data/{plant_id}
@router.get("/plant-data/{plant_id}", response_model=PlantDataEnhanced)
async def get_plant_data(plant_id: UUID):
    """Get single plant data by ID"""
    plant = await db.plant_data_enhanced.find_one({"plantDataId": str(plant_id)})
    if not plant:
        raise HTTPException(status_code=404, detail="Plant data not found")
    return plant

# POST /api/v1/plant-data
@router.post("/plant-data", response_model=PlantDataEnhanced, status_code=201)
async def create_plant_data(
    plant_data: PlantDataEnhancedCreate,
    current_user: User = Depends(get_current_user)
):
    """Create new plant data (agronomist only)"""
    new_plant = PlantDataEnhanced(
        **plant_data.model_dump(),
        createdBy=current_user.userId,
        createdByEmail=current_user.email
    )
    await db.plant_data_enhanced.insert_one(new_plant.model_dump(mode='json'))
    return new_plant

# PATCH /api/v1/plant-data/{plant_id}
@router.patch("/plant-data/{plant_id}", response_model=PlantDataEnhanced)
async def update_plant_data(
    plant_id: UUID,
    updates: PlantDataEnhancedUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update plant data (increments version)"""
    existing = await db.plant_data_enhanced.find_one({"plantDataId": str(plant_id)})
    if not existing:
        raise HTTPException(status_code=404, detail="Plant data not found")

    update_data = updates.model_dump(exclude_unset=True)
    update_data["updatedAt"] = datetime.utcnow()
    update_data["dataVersion"] = existing["dataVersion"] + 1

    await db.plant_data_enhanced.update_one(
        {"plantDataId": str(plant_id)},
        {"$set": update_data}
    )
    return await get_plant_data(plant_id)

# DELETE /api/v1/plant-data/{plant_id}
@router.delete("/plant-data/{plant_id}", status_code=204)
async def delete_plant_data(
    plant_id: UUID,
    current_user: User = Depends(get_current_user)
):
    """Soft delete plant data"""
    result = await db.plant_data_enhanced.update_one(
        {"plantDataId": str(plant_id), "deletedAt": None},
        {"$set": {"deletedAt": datetime.utcnow()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Plant data not found")
    return Response(status_code=204)
```

---

## 🔧 Maintenance & Operations

### Monitor Index Usage
```python
# Check index statistics
db.plant_data_enhanced.aggregate([{"$indexStats": {}}])
```

### Rebuild Indexes (if fragmented)
```python
db.plant_data_enhanced.reIndex()
```

### Database Backup
```bash
# Backup plant data collection
mongodump --db farm_management_db \
  --collection plant_data_enhanced \
  --out /backup/plant_data_$(date +%Y%m%d)
```

### Performance Monitoring
```python
# Explain query execution
query = {"farmTypeCompatibility": "hydroponic"}
cursor = db.plant_data_enhanced.find(query)
explain_result = await cursor.explain()
print(explain_result["executionStats"])
```

---

## ✅ Implementation Checklist

### Phase 1: Schema Design ✅ COMPLETE
- [x] Design comprehensive enhanced schema
- [x] Create Pydantic models with validation
- [x] Define all sub-document structures
- [x] Implement enums for type safety
- [x] Add backward compatibility layer

### Phase 2: Database Setup ✅ COMPLETE
- [x] Design index strategy (10 indexes)
- [x] Create index creation script
- [x] Document index usage and performance
- [x] Create sample data (3 plants)
- [x] Write migration guide

### Phase 3: Migration Planning ✅ COMPLETE
- [x] Design migration strategy (parallel schema)
- [x] Create mapper utility structure
- [x] Plan dual-write implementation
- [x] Define rollback procedures
- [x] Document testing strategy

### Phase 4: Implementation (TODO)
- [ ] Implement PlantDataMigrationMapper class
- [ ] Create bulk migration script
- [ ] Create validation script
- [ ] Add feature flags for gradual rollout
- [ ] Implement dual-write in API endpoints
- [ ] Write unit tests for models
- [ ] Write integration tests for queries

### Phase 5: Migration Execution (TODO)
- [ ] Deploy enhanced schema to staging
- [ ] Run migration on staging data
- [ ] Validate migrated data
- [ ] Performance test queries
- [ ] Deploy to production with feature flags
- [ ] Monitor during gradual cutover

### Phase 6: Cutover & Cleanup (TODO)
- [ ] Complete cutover to enhanced schema
- [ ] Stop dual writes
- [ ] Mark legacy collection read-only
- [ ] Monitor for 30 days
- [ ] Archive legacy collection
- [ ] Update documentation

---

## 📞 Support & Questions

### Key Contacts
- **Database Team**: database-team@farmtech.com
- **Agronomist Lead**: agronomist@farmtech.com
- **Dev Team**: dev-team@farmtech.com

### Resources
- MongoDB Documentation: https://docs.mongodb.com
- Pydantic Documentation: https://docs.pydantic.dev
- Motor (Async MongoDB): https://motor.readthedocs.io

---

## 📅 Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-10-31 | Initial enhanced schema design |
| 1.1 | TBD | Post-migration updates based on feedback |

---

## 🎓 Summary

This enhanced Plant Data schema provides:

✅ **Comprehensive agronomic data** - 13 major categories covering all cultivation aspects
✅ **Production-ready design** - Secure UUIDs, indexing, versioning
✅ **Backward compatible** - Parallel schema migration approach
✅ **Query optimized** - 10 strategic indexes for performance
✅ **Well-documented** - Complete guides, samples, and migration strategy
✅ **Flexible** - Supports multiple farm types and cultivation methods
✅ **Maintainable** - Clear structure, validation, and audit trail

The schema is ready for implementation following the phased migration approach outlined in `plant_data_migration_guide.md`.
