# Database Design Agent Rules

**Specialization:** MongoDB, MySQL, schema design, indexing, query optimization
**Prerequisites:** Must follow `00-core-philosophy.md`

---

## CRITICAL: MCP Tool Usage for Database Work

**MANDATORY: ALL database operations and verification MUST use MongoDB MCP.**

### When to Use MongoDB MCP

**ALWAYS use MongoDB MCP for:**
- ✅ Inspecting database collections and documents
- ✅ Running and testing queries
- ✅ Verifying schema design
- ✅ Testing aggregation pipelines
- ✅ Checking index usage with explain()
- ✅ Verifying data integrity
- ✅ Performance testing queries
- ❌ NEVER use mongo shell commands
- ❌ NEVER use pymongo with print statements
- ❌ NEVER use bash scripts to query database

### Database Design Workflow

1. **Design Schema**
   - Define collections and documents
   - Plan relationships
   - Determine required indexes

2. **Verify with MongoDB MCP** (MANDATORY)
   - Use `mcp__mongodb__collection-schema` to verify structure
   - Use `mcp__mongodb__collection-indexes` to check indexes
   - Use `mcp__mongodb__find` to inspect documents
   - Use `mcp__mongodb__explain` to verify query performance

3. **Test Operations**
   - Use MongoDB MCP to test CRUD operations
   - Verify data integrity
   - Check performance

---

## MongoDB Naming Conventions

### Collection Names

**Use snake_case plural nouns:**

```
✅ CORRECT:
- users
- farm_assignments
- plant_data
- daily_harvests
- block_cycles

❌ WRONG:
- Users (PascalCase)
- farmAssignments (camelCase)
- plant-data (kebab-case)
- DailyHarvest (singular + PascalCase)
```

### Field Names

**Use camelCase for field names:**

```javascript
✅ CORRECT:
{
  userId: "uuid",
  createdAt: "2025-01-01",
  plantDataId: "uuid",
  maxPlants: 100
}

❌ WRONG:
{
  user_id: "uuid",        // snake_case
  CreatedAt: "2025-01-01", // PascalCase
  "plant-data-id": "uuid"  // kebab-case
}
```

### Why These Conventions?

- **Collections (snake_case)**: Matches Python naming, easier to type in shell
- **Fields (camelCase)**: JavaScript/JSON convention, matches frontend
- **Consistency**: Makes code predictable and maintainable

---

## Schema Design

### Document Structure

```javascript
// Example: User document
{
  _id: ObjectId("..."),
  userId: "uuid-v4",  // Application-level unique ID
  email: "user@example.com",
  passwordHash: "bcrypt-hash",
  fullName: "John Doe",
  role: "user",
  permissions: ["farm.view", "farm.operate"],
  isActive: true,
  createdAt: ISODate("2025-01-01T00:00:00Z"),
  updatedAt: ISODate("2025-01-01T00:00:00Z")
}
```

### Design Principles

1. **Embed vs Reference**
   - Embed: One-to-few, data accessed together
   - Reference: One-to-many, data accessed independently

2. **Data Types**
   - Use proper BSON types (Date, ObjectId, etc.)
   - Don't store dates as strings
   - Use NumberInt/NumberLong for numbers

3. **Versioning**
   - Include version fields for critical data
   - Example: `dataVersion: 1` for plant data

### Testing Schema with MongoDB MCP

**After designing schema:**
```
1. Insert sample document
2. Use MongoDB MCP to verify:
   - mcp__mongodb__find() - Check document structure
   - mcp__mongodb__collection-schema() - Validate schema
   - Verify all required fields present
   - Check field types are correct
```

---

## Indexing Strategy

### Index Types

**Single Field Index:**
```javascript
// Create index on email field
db.users.createIndex({ email: 1 }, { unique: true })
```

**Compound Index:**
```javascript
// Index on multiple fields
db.farm_assignments.createIndex({ userId: 1, farmId: 1 }, { unique: true })
```

**Text Index:**
```javascript
// Full-text search
db.plant_data.createIndex({ plantName: "text", scientificName: "text" })
```

**TTL Index (Auto-deletion):**
```javascript
// Delete documents after expiry
db.sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
```

### Index Best Practices

1. **Query Patterns First**
   - Analyze common queries
   - Index fields used in filters
   - Index sort fields

2. **Compound Index Order**
   - Equality filters first
   - Sort fields next
   - Range filters last

3. **Unique Constraints**
   - Use unique indexes for unique fields
   - Prevents duplicate data
   - Example: email, userId

### Verifying Indexes with MongoDB MCP

**MANDATORY: Always verify index usage:**

```
After creating indexes:
1. Use MongoDB MCP: mcp__mongodb__collection-indexes()
   - Verify indexes were created
   - Check index properties (unique, sparse, etc.)

2. Use MongoDB MCP: mcp__mongodb__explain()
   - Run your queries with explain
   - Verify index is being used (IXSCAN not COLLSCAN)
   - Check query performance metrics
```

---

## Query Optimization

### Efficient Queries

```javascript
// ✅ CORRECT - Uses index on email
db.users.find({ email: "user@example.com" })

// ❌ INEFFICIENT - Full collection scan
db.users.find({})

// ✅ CORRECT - Projection reduces data transfer
db.users.find(
  { email: "user@example.com" },
  { email: 1, fullName: 1, _id: 0 }
)

// ❌ INEFFICIENT - Returns all fields
db.users.find({ email: "user@example.com" })
```

### Aggregation Pipelines

```javascript
// Efficient aggregation with indexes
db.farm_assignments.aggregate([
  // Stage 1: Match (uses index)
  { $match: { userId: "uuid" } },

  // Stage 2: Lookup (join)
  { $lookup: {
      from: "farms",
      localField: "farmId",
      foreignField: "farmId",
      as: "farm"
  }},

  // Stage 3: Project (reduce data)
  { $project: {
      userId: 1,
      farmName: "$farm.name",
      role: 1
  }}
])
```

### Testing Queries with MongoDB MCP

**Workflow for query optimization:**

```
1. Implement query in code
2. Use MongoDB MCP to test:
   - mcp__mongodb__find() or aggregate() - Run query
   - Check results are correct
3. Use MongoDB MCP explain:
   - mcp__mongodb__explain() - Analyze performance
   - Verify IXSCAN (index scan) not COLLSCAN
   - Check execution time
4. Optimize if needed:
   - Add indexes
   - Reorder pipeline stages
   - Add projections
5. Re-test with MongoDB MCP
```

---

## Data Relationships

### One-to-Few (Embed)

```javascript
// Farm with embedded location
{
  farmId: "uuid",
  name: "Green Valley Farm",
  location: {
    latitude: 40.7128,
    longitude: -74.0060,
    address: "123 Farm Road"
  }
}
```

### One-to-Many (Reference)

```javascript
// Blocks reference farm
{
  blockId: "uuid",
  farmId: "uuid",  // Reference to farm
  name: "Block A-1",
  maxPlants: 500
}
```

### Many-to-Many (Bridge Collection)

```javascript
// farm_assignments bridges users and farms
{
  assignmentId: "uuid",
  userId: "uuid",  // Reference to user
  farmId: "uuid",  // Reference to farm
  role: "manager"
}
```

### Testing Relationships with MongoDB MCP

**Verify relationships work correctly:**

```
1. Create parent document (e.g., farm)
2. Use MongoDB MCP: verify farm created
3. Create child document (e.g., block with farmId reference)
4. Use MongoDB MCP: verify block created with correct farmId
5. Query relationship:
   - Use aggregation with $lookup
   - Use MongoDB MCP to verify join works
   - Check all related data is returned
```

---

## Data Integrity

### Validation Rules

```javascript
// MongoDB schema validation
db.createCollection("users", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["email", "passwordHash", "role"],
      properties: {
        email: {
          bsonType: "string",
          pattern: "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$"
        },
        role: {
          enum: ["user", "manager", "admin", "super_admin"]
        }
      }
    }
  }
})
```

### Referential Integrity

- **Soft deletes**: Use `isActive: false` instead of deleting
- **Cascade deletes**: Handle in application code
- **Orphan prevention**: Check references before deleting

### Verifying Data Integrity with MongoDB MCP

**After implementing validation:**

```
1. Try to insert invalid document
2. Use MongoDB MCP: verify insertion fails
3. Check error message
4. Insert valid document
5. Use MongoDB MCP: verify insertion succeeds
6. Use collection-schema to verify structure
```

---

## Historical Data & Archiving

### Data Retention Strategy

**Hot Data (Active Collections):**
- Current/active records
- Frequently accessed
- Fast queries required

**Warm Data (Archive Collections):**
```javascript
// Move old data to archive
db.block_cycles.aggregate([
  { $match: { completedAt: { $lt: ISODate("2024-01-01") } } },
  { $out: "block_cycles_archive" }
])

// Remove from active collection
db.block_cycles.deleteMany({ completedAt: { $lt: ISODate("2024-01-01") } })
```

**Cold Data (External Storage):**
- Export to S3/Azure Blob
- Keep for analytics/AI training
- Slower access acceptable

---

## Performance Best Practices

### Query Performance

1. **Use Indexes**
   - Index all query filter fields
   - Verify with explain()

2. **Limit Results**
   - Use `.limit()` for pagination
   - Don't return entire collections

3. **Project Fields**
   - Only return needed fields
   - Reduces network transfer

4. **Optimize Aggregations**
   - Match early to reduce documents
   - Project to reduce field size
   - Index fields used in $match

### Testing Performance with MongoDB MCP

**Performance testing workflow:**

```
1. Implement query
2. Use MongoDB MCP to run query
3. Use MongoDB MCP explain:
   - Check execution stats
   - Verify index usage
   - Note execution time
4. Set performance baseline (e.g., < 100ms)
5. Optimize if needed
6. Re-test with MongoDB MCP to verify improvement
```

---

## Database Operations

### CRUD Operations Testing

**Create:**
```
1. Implement insert operation
2. Use MongoDB MCP: insert-many or find (to verify)
3. Check document structure matches schema
```

**Read:**
```
1. Implement find/aggregate query
2. Use MongoDB MCP: find or aggregate
3. Verify results are correct
4. Use explain to check performance
```

**Update:**
```
1. Implement update operation
2. Use MongoDB MCP: update-many
3. Use find to verify changes applied
4. Check all fields updated correctly
```

**Delete:**
```
1. Implement delete (or soft delete)
2. Use MongoDB MCP: delete-many
3. Use count or find to verify deletion
4. Check referential integrity maintained
```

---

## Common Database Pitfalls

### 1. Wrong Naming Conventions
❌ Using inconsistent naming (PascalCase, kebab-case)
✅ Collections: snake_case, Fields: camelCase

### 2. Missing Indexes
❌ Queries doing full collection scans (COLLSCAN)
✅ Create indexes on filter/sort fields, verify with explain()

### 3. Not Testing with MongoDB MCP
❌ Using mongo shell or print statements
✅ ALWAYS use MongoDB MCP for verification

### 4. Embedding Too Much Data
❌ Embedding large arrays that grow unbounded
✅ Use references for one-to-many relationships

### 5. Not Using Proper Data Types
❌ Storing dates as strings
✅ Use ISODate for dates, proper number types

---

## Database Design Checklist

Before considering schema complete:
- [ ] Collection names follow snake_case convention
- [ ] Field names follow camelCase convention
- [ ] Appropriate indexes created
- [ ] **Index usage verified with MongoDB MCP explain()** (MANDATORY)
- [ ] **Schema tested with MongoDB MCP** (MANDATORY)
- [ ] Data types are appropriate (Date, Number, etc.)
- [ ] Relationships designed correctly (embed vs reference)
- [ ] Validation rules implemented
- [ ] Performance tested and optimized
- [ ] Data retention strategy defined

---

## Remember: MongoDB MCP Is Mandatory

**CRITICAL Rules:**
1. ✅ ALWAYS use MongoDB MCP to inspect collections
2. ✅ ALWAYS use MongoDB MCP to verify queries
3. ✅ ALWAYS use explain() to check index usage
4. ❌ NEVER use mongo shell commands
5. ❌ NEVER use pymongo with print statements
6. ❌ NEVER skip MCP verification

**Why MongoDB MCP matters:**
- Provides structured, formatted results
- Shows query performance metrics
- Verifies schema correctness
- Tests indexes are being used
- Ensures data integrity
- Debugging capabilities

---

**Last Updated:** 2025-11-01
**Version:** 1.0.0
