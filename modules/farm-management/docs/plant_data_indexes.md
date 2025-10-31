# Plant Data MongoDB Indexes

## Index Strategy Overview

The Plant Data collection requires strategic indexing for optimal query performance. This document defines all required indexes with justifications based on expected query patterns.

---

## Required Indexes

### 1. Primary Key Index
```javascript
db.plant_data.createIndex(
  { "plantDataId": 1 },
  {
    name: "idx_plant_data_plant_data_id",
    unique: true
  }
)
```
**Type:** Unique, Single-field
**Purpose:** Primary key lookup for individual plant records
**Query Pattern:** `find({ plantDataId: "uuid" })`
**Justification:** UUID-based primary key for secure, non-enumerable resource identification

---

### 2. Plant Name Search Index
```javascript
db.plant_data.createIndex(
  { "plantName": 1 },
  {
    name: "idx_plant_data_plant_name"
  }
)
```
**Type:** Single-field
**Purpose:** Fast lookup and autocomplete by common plant name
**Query Pattern:** `find({ plantName: "Tomato" })` or `find({ plantName: /^Tom/i })`
**Justification:** Most common search field - users search by common names

---

### 3. Scientific Name Index
```javascript
db.plant_data.createIndex(
  { "scientificName": 1 },
  {
    name: "idx_plant_data_scientific_name",
    unique: true,
    partialFilterExpression: { scientificName: { $exists: true, $ne: null } }
  }
)
```
**Type:** Unique, Single-field, Partial
**Purpose:** Unique constraint on scientific names, agronomist searches
**Query Pattern:** `find({ scientificName: "Solanum lycopersicum" })`
**Justification:** Scientific names must be unique; partial index handles null values

---

### 4. Farm Type Compatibility Index
```javascript
db.plant_data.createIndex(
  { "farmTypeCompatibility": 1 },
  {
    name: "idx_plant_data_farm_type_compatibility"
  }
)
```
**Type:** Multikey (Array) Index
**Purpose:** Filter plants by supported farm types
**Query Pattern:** `find({ farmTypeCompatibility: "hydroponic" })`
**Justification:** Critical for filtering plants by farm infrastructure type

---

### 5. Tags Search Index
```javascript
db.plant_data.createIndex(
  { "tags": 1 },
  {
    name: "idx_plant_data_tags"
  }
)
```
**Type:** Multikey (Array) Index
**Purpose:** Tag-based search and filtering
**Query Pattern:** `find({ tags: "vegetable" })` or `find({ tags: { $in: ["summer", "fruit"] } })`
**Justification:** Common search pattern for categorizing and filtering plants

---

### 6. Growth Cycle Duration Index
```javascript
db.plant_data.createIndex(
  { "growthCycle.totalCycleDays": 1 },
  {
    name: "idx_plant_data_growth_cycle_total"
  }
)
```
**Type:** Single-field (Embedded)
**Purpose:** Filter and sort plants by total growth duration
**Query Pattern:** `find({ "growthCycle.totalCycleDays": { $lte: 60 } }).sort({ "growthCycle.totalCycleDays": 1 })`
**Justification:** Farmers often search for fast-growing crops

---

### 7. Soft Delete Filter Index
```javascript
db.plant_data.createIndex(
  { "deletedAt": 1 },
  {
    name: "idx_plant_data_deleted_at",
    sparse: true
  }
)
```
**Type:** Single-field, Sparse
**Purpose:** Efficiently filter out soft-deleted records
**Query Pattern:** `find({ deletedAt: null })` or `find({ deletedAt: { $ne: null } })`
**Justification:** Sparse index saves space since most records won't be deleted

---

### 8. Created By User Index
```javascript
db.plant_data.createIndex(
  { "createdBy": 1, "createdAt": -1 },
  {
    name: "idx_plant_data_created_by_created_at"
  }
)
```
**Type:** Compound Index
**Purpose:** User's plant data sorted by creation date
**Query Pattern:** `find({ createdBy: "user-uuid" }).sort({ createdAt: -1 })`
**Justification:** Users viewing their own plant data entries

---

### 9. Active Records Compound Index
```javascript
db.plant_data.createIndex(
  { "deletedAt": 1, "updatedAt": -1 },
  {
    name: "idx_plant_data_deleted_at_updated_at"
  }
)
```
**Type:** Compound Index
**Purpose:** List active (non-deleted) records sorted by last update
**Query Pattern:** `find({ deletedAt: null }).sort({ updatedAt: -1 })`
**Justification:** Common admin view to see recently updated active plants

---

### 10. Text Search Index (Optional but Recommended)
```javascript
db.plant_data.createIndex(
  {
    "plantName": "text",
    "scientificName": "text",
    "tags": "text",
    "additionalInfo.notes": "text"
  },
  {
    name: "idx_plant_data_text_search",
    weights: {
      plantName: 10,
      scientificName: 8,
      tags: 5,
      "additionalInfo.notes": 1
    }
  }
)
```
**Type:** Text Index
**Purpose:** Full-text search across multiple fields
**Query Pattern:** `find({ $text: { $search: "tomato heat resistant" } })`
**Justification:** Enables powerful search functionality with relevance ranking

---

## Index Creation Script

```javascript
// MongoDB Shell Script to Create All Indexes
// Run this in MongoDB shell or via driver

use farm_management_db;

// 1. Primary Key
db.plant_data.createIndex(
  { "plantDataId": 1 },
  { name: "idx_plant_data_plant_data_id", unique: true }
);

// 2. Plant Name
db.plant_data.createIndex(
  { "plantName": 1 },
  { name: "idx_plant_data_plant_name" }
);

// 3. Scientific Name
db.plant_data.createIndex(
  { "scientificName": 1 },
  {
    name: "idx_plant_data_scientific_name",
    unique: true,
    partialFilterExpression: { scientificName: { $exists: true, $ne: null } }
  }
);

// 4. Farm Type Compatibility
db.plant_data.createIndex(
  { "farmTypeCompatibility": 1 },
  { name: "idx_plant_data_farm_type_compatibility" }
);

// 5. Tags
db.plant_data.createIndex(
  { "tags": 1 },
  { name: "idx_plant_data_tags" }
);

// 6. Growth Cycle
db.plant_data.createIndex(
  { "growthCycle.totalCycleDays": 1 },
  { name: "idx_plant_data_growth_cycle_total" }
);

// 7. Soft Delete
db.plant_data.createIndex(
  { "deletedAt": 1 },
  { name: "idx_plant_data_deleted_at", sparse: true }
);

// 8. Created By User
db.plant_data.createIndex(
  { "createdBy": 1, "createdAt": -1 },
  { name: "idx_plant_data_created_by_created_at" }
);

// 9. Active Records
db.plant_data.createIndex(
  { "deletedAt": 1, "updatedAt": -1 },
  { name: "idx_plant_data_deleted_at_updated_at" }
);

// 10. Text Search (Optional)
db.plant_data.createIndex(
  {
    "plantName": "text",
    "scientificName": "text",
    "tags": "text",
    "additionalInfo.notes": "text"
  },
  {
    name: "idx_plant_data_text_search",
    weights: {
      plantName: 10,
      scientificName: 8,
      tags: 5,
      "additionalInfo.notes": 1
    }
  }
);

print("✅ All Plant Data indexes created successfully");
```

---

## Python Index Creation (Motor/PyMongo)

```python
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING, DESCENDING, TEXT

async def create_plant_data_indexes(db):
    """
    Create all required indexes for plant_data collection
    """
    collection = db.plant_data

    # 1. Primary Key
    await collection.create_index(
        [("plantDataId", ASCENDING)],
        name="idx_plant_data_plant_data_id",
        unique=True
    )

    # 2. Plant Name
    await collection.create_index(
        [("plantName", ASCENDING)],
        name="idx_plant_data_plant_name"
    )

    # 3. Scientific Name
    await collection.create_index(
        [("scientificName", ASCENDING)],
        name="idx_plant_data_scientific_name",
        unique=True,
        partialFilterExpression={"scientificName": {"$exists": True, "$ne": None}}
    )

    # 4. Farm Type Compatibility
    await collection.create_index(
        [("farmTypeCompatibility", ASCENDING)],
        name="idx_plant_data_farm_type_compatibility"
    )

    # 5. Tags
    await collection.create_index(
        [("tags", ASCENDING)],
        name="idx_plant_data_tags"
    )

    # 6. Growth Cycle
    await collection.create_index(
        [("growthCycle.totalCycleDays", ASCENDING)],
        name="idx_plant_data_growth_cycle_total"
    )

    # 7. Soft Delete
    await collection.create_index(
        [("deletedAt", ASCENDING)],
        name="idx_plant_data_deleted_at",
        sparse=True
    )

    # 8. Created By User
    await collection.create_index(
        [("createdBy", ASCENDING), ("createdAt", DESCENDING)],
        name="idx_plant_data_created_by_created_at"
    )

    # 9. Active Records
    await collection.create_index(
        [("deletedAt", ASCENDING), ("updatedAt", DESCENDING)],
        name="idx_plant_data_deleted_at_updated_at"
    )

    # 10. Text Search (Optional)
    await collection.create_index(
        [
            ("plantName", TEXT),
            ("scientificName", TEXT),
            ("tags", TEXT),
            ("additionalInfo.notes", TEXT)
        ],
        name="idx_plant_data_text_search",
        weights={
            "plantName": 10,
            "scientificName": 8,
            "tags": 5,
            "additionalInfo.notes": 1
        }
    )

    print("✅ All Plant Data indexes created successfully")
```

---

## Query Performance Examples

### Example 1: Search by Plant Name
```javascript
// Query
db.plant_data.find({
  plantName: "Tomato",
  deletedAt: null
})

// Uses: idx_plant_data_plant_name + idx_plant_data_deleted_at
// Execution: Index intersection or compound scan
```

### Example 2: Filter by Farm Type and Sort by Growth Cycle
```javascript
// Query
db.plant_data.find({
  farmTypeCompatibility: "hydroponic",
  deletedAt: null
}).sort({ "growthCycle.totalCycleDays": 1 })

// Uses: idx_plant_data_farm_type_compatibility + in-memory sort
// Recommended: Add compound index if this pattern is frequent
```

### Example 3: User's Recent Plant Data
```javascript
// Query
db.plant_data.find({
  createdBy: "user-uuid-here",
  deletedAt: null
}).sort({ createdAt: -1 }).limit(20)

// Uses: idx_plant_data_created_by_created_at (perfectly covered)
// Execution: Index-only scan with filter
```

### Example 4: Full-Text Search
```javascript
// Query
db.plant_data.find({
  $text: { $search: "tomato heat resistant greenhouse" }
}).sort({ score: { $meta: "textScore" } })

// Uses: idx_plant_data_text_search
// Execution: Text index scan with relevance scoring
```

---

## Index Maintenance

### Monitor Index Usage
```javascript
// Check index statistics
db.plant_data.aggregate([
  { $indexStats: {} }
])
```

### Remove Unused Indexes
```javascript
// If an index shows zero usage after monitoring period
db.plant_data.dropIndex("idx_name_here")
```

### Rebuild Indexes (if fragmented)
```javascript
db.plant_data.reIndex()
```

---

## Performance Considerations

1. **Index Size**: With 10 indexes, expect ~15-25% storage overhead
2. **Write Performance**: Indexes slow down inserts/updates slightly (acceptable trade-off)
3. **Memory**: Keep indexes in RAM for best performance (monitor with `db.stats()`)
4. **Covered Queries**: Use projections to enable index-only scans
5. **Cardinality**: High-cardinality fields (plantDataId, scientificName) index well

---

## Expected Query Patterns

Based on Farm Management Module requirements:

| Query Pattern | Frequency | Index Used |
|--------------|-----------|------------|
| Get plant by ID | Very High | idx_plant_data_plant_data_id |
| Search by name | High | idx_plant_data_plant_name |
| Filter by farm type | High | idx_plant_data_farm_type_compatibility |
| List user's plants | Medium | idx_plant_data_created_by_created_at |
| Search by tags | Medium | idx_plant_data_tags |
| Filter by growth cycle | Medium | idx_plant_data_growth_cycle_total |
| Full-text search | Low | idx_plant_data_text_search |
| Admin: View recent updates | Low | idx_plant_data_deleted_at_updated_at |

---

## Security Notes

- **UUID Indexes**: UUIDs prevent enumeration attacks but have larger index size
- **Email Index**: Not included (createdByEmail not queried directly)
- **Partial Indexes**: Used for optional/nullable fields to save space
- **Sparse Indexes**: Used for deletedAt (soft delete pattern)

---

## Version History

- **v1.0** (2025-10-31): Initial index strategy for enhanced plant data schema
