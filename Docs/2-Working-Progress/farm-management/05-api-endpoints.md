# Farm Management Module - API Endpoints

## API Endpoints

### Base Path
All endpoints under: `/api/v1/farm/`

### 1. Plant Data Endpoints

#### Get All Plant Data
```
GET /api/v1/farm/plant-data
Auth: Required (JWT)
Permissions: farm.view
Query params:
  - page (int, default: 1)
  - perPage (int, default: 20, max: 100)
  - search (string, optional): Search in plantName, scientificName
  - plantType (string, optional): Filter by plant type
Response: 200 OK
{
  "data": [PlantData, ...],
  "meta": { "total": 100, "page": 1, "perPage": 20, "totalPages": 5 }
}
```

#### Get Plant Data by ID
```
GET /api/v1/farm/plant-data/{plantDataId}
Auth: Required
Permissions: farm.view
Response: 200 OK
{ PlantData }
```

#### Create Plant Data
```
POST /api/v1/farm/plant-data
Auth: Required
Permissions: agronomist
Body: PlantData (without IDs, timestamps)
Response: 201 Created
{ PlantData }
```

#### Update Plant Data
```
PATCH /api/v1/farm/plant-data/{plantDataId}
Auth: Required
Permissions: agronomist
Body: Partial PlantData
Response: 200 OK
{ PlantData }
Note: Creates new dataVersion, does not affect already planted blocks
```

#### Delete Plant Data
```
DELETE /api/v1/farm/plant-data/{plantDataId}
Auth: Required
Permissions: agronomist
Response: 200 OK
{ "message": "Plant data deleted" }
Validation: Cannot delete if used in active plantings
```

#### Import Plant Data (CSV)
```
POST /api/v1/farm/plant-data/import
Auth: Required
Permissions: agronomist
Body: multipart/form-data
  - file: CSV file
Response: 200 OK
{
  "imported": 45,
  "skipped": 2,
  "errors": [
    { "row": 5, "error": "Invalid temperature range" }
  ]
}
```

#### Download Plant Data Template
```
GET /api/v1/farm/plant-data/template
Auth: Required
Permissions: farm.view
Response: 200 OK (text/csv)
Headers: Content-Disposition: attachment; filename="plant_data_template.csv"
```

---

### 2. Farm Endpoints

#### Get All Farms
```
GET /api/v1/farm/farms
Auth: Required
Permissions: farm.view
Query params:
  - page, perPage
  - isActive (bool, optional)
Response: 200 OK
{
  "data": [Farm, ...],
  "meta": { pagination }
}
Note: Users only see farms they are assigned to (unless admin)
```

#### Get Farm by ID
```
GET /api/v1/farm/farms/{farmId}
Auth: Required
Permissions: farm.view + assigned to farm
Response: 200 OK
{ Farm }
```

#### Create Farm
```
POST /api/v1/farm/farms
Auth: Required
Permissions: farm.manage
Body: Farm (without IDs, timestamps)
Response: 201 Created
{ Farm }
Note: Creator automatically assigned as farm manager
```

#### Update Farm
```
PATCH /api/v1/farm/farms/{farmId}
Auth: Required
Permissions: farm.manage + assigned to farm (as manager)
Body: Partial Farm
Response: 200 OK
{ Farm }
```

#### Delete Farm
```
DELETE /api/v1/farm/farms/{farmId}
Auth: Required
Permissions: farm.manage + assigned to farm (as manager)
Response: 200 OK
{ "message": "Farm deleted" }
Validation: Cannot delete if has active blocks
```

#### Get Farm Summary
```
GET /api/v1/farm/farms/{farmId}/summary
Auth: Required
Permissions: farm.view + assigned to farm
Response: 200 OK
{
  "farm": { Farm },
  "statistics": {
    "totalBlocks": 10,
    "emptyBlocks": 3,
    "plannedBlocks": 2,
    "plantedBlocks": 4,
    "harvestingBlocks": 1,
    "alertBlocks": 0,
    "totalPredictedYield": 5000.0,
    "yieldUnit": "kg"
  },
  "recentActivity": [
    { "type": "planting", "blockName": "Block A-1", "date": "2025-01-15" }
  ]
}
```

---

### 3. Block Endpoints

#### Get Blocks
```
GET /api/v1/farm/blocks
Auth: Required
Permissions: farm.view + assigned to farm
Query params:
  - farmId (UUID, required)
  - page, perPage
  - state (BlockState, optional)
Response: 200 OK
{
  "data": [Block, ...],
  "meta": { pagination }
}
```

#### Get Block by ID
```
GET /api/v1/farm/blocks/{blockId}
Auth: Required
Permissions: farm.view + assigned to farm
Response: 200 OK
{
  "block": { Block },
  "planting": { Planting } (if currentPlanting exists),
  "harvest": { Harvest } (if recently harvested)
}
```

#### Create Block
```
POST /api/v1/farm/blocks
Auth: Required
Permissions: farm.manage + assigned to farm (as manager)
Body: Block (without IDs, timestamps)
Response: 201 Created
{ Block }
```

#### Update Block
```
PATCH /api/v1/farm/blocks/{blockId}
Auth: Required
Permissions: farm.manage + assigned to farm (as manager)
Body: Partial Block
Response: 200 OK
{ Block }
Validation: Cannot change maxPlants if block has active planting
```

#### Delete Block
```
DELETE /api/v1/farm/blocks/{blockId}
Auth: Required
Permissions: farm.manage + assigned to farm (as manager)
Response: 200 OK
{ "message": "Block deleted" }
Validation: Can only delete if state = empty
```

---

### 4. Planting Endpoints

#### Create Planting Plan
```
POST /api/v1/farm/plantings
Auth: Required
Permissions: farm.manage + assigned to farm (as manager)
Body:
{
  "blockId": "uuid",
  "plants": [
    { "plantDataId": "uuid", "quantity": 50 },
    { "plantDataId": "uuid", "quantity": 30 }
  ]
}
Response: 201 Created
{
  "planting": { Planting },
  "blockUpdated": { Block }
}
Validation:
  - Block must be in EMPTY state
  - Sum of quantities <= block.maxPlants
  - All plantDataIds must exist
State transition: Block EMPTY → PLANNED
```

#### Mark as Planted
```
POST /api/v1/farm/plantings/{plantingId}/mark-planted
Auth: Required
Permissions: farm.operate + assigned to farm
Response: 200 OK
{
  "planting": { Planting },
  "block": { Block }
}
Validation:
  - Planting status must be "planned"
  - Block must be in PLANNED state
State transition: Block PLANNED → PLANTED
```

#### Get Planting by ID
```
GET /api/v1/farm/plantings/{plantingId}
Auth: Required
Permissions: farm.view + assigned to farm
Response: 200 OK
{ Planting }
```

---

### 5. Harvest Endpoints

#### Record Harvest
```
POST /api/v1/farm/harvests
Auth: Required
Permissions: farm.operate + assigned to farm
Body:
{
  "plantingId": "uuid",
  "blockId": "uuid",
  "entries": [
    {
      "plantDataId": "uuid",
      "plantName": "Tomato",
      "quantityHarvested": 240.0,
      "qualityGrade": "A",
      "notes": "Excellent quality"
    }
  ],
  "harvestStartDate": "2025-04-15T06:00:00Z",
  "harvestEndDate": "2025-04-20T18:00:00Z",
  "notes": "Overall good harvest"
}
Response: 201 Created
{
  "harvest": { Harvest },
  "block": { Block }
}
Validation:
  - Block must be in HARVESTING state
  - Planting must exist and be active
State transition: Block HARVESTING → EMPTY
```

#### Get Harvest by ID
```
GET /api/v1/farm/harvests/{harvestId}
Auth: Required
Permissions: farm.view + assigned to farm
Response: 200 OK
{ Harvest }
```

#### Get Farm Harvest History
```
GET /api/v1/farm/harvests
Auth: Required
Permissions: farm.view + assigned to farm
Query params:
  - farmId (UUID, required)
  - page, perPage
  - startDate, endDate (optional)
Response: 200 OK
{
  "data": [Harvest, ...],
  "meta": { pagination },
  "summary": {
    "totalHarvests": 25,
    "totalYield": 6500.0,
    "avgYieldEfficiency": 92.5
  }
}
```

---

### 6. Alert Endpoints

#### Trigger Alert
```
POST /api/v1/farm/blocks/{blockId}/alert
Auth: Required
Permissions: farm.operate + assigned to farm
Body:
{
  "description": "Aphid infestation on tomatoes",
  "severity": "high"
}
Response: 200 OK
{
  "block": { Block },
  "alert": {
    "alertId": "uuid",
    "description": "...",
    "triggeredBy": "uuid",
    "triggeredAt": "2025-01-20T10:00:00Z"
  }
}
Validation:
  - Block must not already be in ALERT state
State transition: Block * → ALERT (saves previous state)
```

#### Resolve Alert
```
POST /api/v1/farm/blocks/{blockId}/resolve-alert
Auth: Required
Permissions: farm.operate or farm.manage + assigned to farm
Body:
{
  "resolutionNotes": "Applied pesticide, infestation controlled"
}
Response: 200 OK
{
  "block": { Block },
  "resolution": {
    "resolvedBy": "uuid",
    "resolvedAt": "2025-01-22T15:00:00Z",
    "notes": "..."
  }
}
Validation:
  - Block must be in ALERT state
State transition: Block ALERT → previous state
```

---

### 7. Yield Prediction Endpoints

#### Get Yield Prediction
```
GET /api/v1/farm/yield/predict
Auth: Required
Permissions: farm.view + assigned to farm
Query params:
  - blockId (UUID, required)
  - plants (JSON array): [{ "plantDataId": "uuid", "quantity": 50 }]
Response: 200 OK
{
  "blockId": "uuid",
  "blockMaxPlants": 500,
  "totalPlants": 80,
  "plantDetails": [
    {
      "plantDataId": "uuid",
      "plantName": "Tomato",
      "quantity": 50,
      "expectedYieldPerPlant": 5.0,
      "totalYield": 250.0,
      "yieldUnit": "kg"
    },
    {
      "plantDataId": "uuid",
      "plantName": "Basil",
      "quantity": 30,
      "expectedYieldPerPlant": 0.5,
      "totalYield": 15.0,
      "yieldUnit": "kg"
    }
  ],
  "predictedTotalYield": 265.0,
  "yieldUnit": "kg",
  "capacityUtilization": 16.0,
  "estimatedHarvestDate": "2025-04-15T00:00:00Z"
}
Validation:
  - Block must exist
  - Sum of quantities <= block.maxPlants
  - All plantDataIds must exist
```

---

### 8. Dashboard Endpoints

#### Farm Manager Dashboard
```
GET /api/v1/farm/dashboard/manager
Auth: Required
Permissions: farm.manage
Response: 200 OK
{
  "farms": [
    {
      "farmId": "uuid",
      "farmName": "Green Valley Farm",
      "totalBlocks": 10,
      "blocksByState": {
        "empty": 3,
        "planned": 2,
        "planted": 4,
        "harvesting": 1,
        "alert": 0
      },
      "totalPredictedYield": 5000.0,
      "upcomingHarvests": [
        {
          "blockName": "Block A-1",
          "estimatedDate": "2025-04-15",
          "predictedYield": 265.0
        }
      ]
    }
  ],
  "recentActivity": [
    {
      "type": "planted",
      "farmName": "Green Valley Farm",
      "blockName": "Block A-1",
      "timestamp": "2025-01-15T08:00:00Z"
    }
  ]
}
```

#### Farmer Dashboard
```
GET /api/v1/farm/dashboard/farmer
Auth: Required
Permissions: farm.operate
Response: 200 OK
{
  "assignedFarms": [
    {
      "farmId": "uuid",
      "farmName": "Green Valley Farm",
      "role": "farmer"
    }
  ],
  "tasks": [
    {
      "type": "plant",
      "farmName": "Green Valley Farm",
      "blockName": "Block B-3",
      "blockId": "uuid",
      "status": "planned",
      "priority": "normal"
    },
    {
      "type": "harvest",
      "farmName": "Green Valley Farm",
      "blockName": "Block A-1",
      "blockId": "uuid",
      "status": "harvesting",
      "priority": "high",
      "estimatedYield": 265.0
    }
  ],
  "alerts": [
    {
      "alertId": "uuid",
      "farmName": "Green Valley Farm",
      "blockName": "Block C-2",
      "blockId": "uuid",
      "description": "Low water pressure",
      "severity": "medium",
      "triggeredAt": "2025-01-20T10:00:00Z"
    }
  ],
  "recentActivity": [
    {
      "type": "planted",
      "blockName": "Block A-1",
      "timestamp": "2025-01-15T08:00:00Z"
    }
  ]
}
```

---



---

**[← Back to Index](./README.md)**
