# Farm Management Module - Database Schema

## Database Schema

### MongoDB Collections

#### 1. farms
```javascript
{
  _id: ObjectId,
  farmId: String (UUID, indexed unique),
  name: String,
  description: String,
  location: {
    latitude: Number,
    longitude: Number,
    address: String
  },
  totalArea: Number,
  areaUnit: String,
  managerId: String (UUID),
  managerEmail: String,
  isActive: Boolean,
  createdAt: Date,
  updatedAt: Date
}

// Indexes
db.farms.createIndex({ farmId: 1 }, { unique: true })
db.farms.createIndex({ managerId: 1 })
db.farms.createIndex({ isActive: 1 })
db.farms.createIndex({ createdAt: -1 })
```

#### 2. blocks
```javascript
{
  _id: ObjectId,
  blockId: String (UUID, indexed unique),
  farmId: String (UUID, indexed),
  name: String,
  description: String,
  area: Number,
  areaUnit: String,
  maxPlants: Number,

  state: String (enum: empty, planned, planted, harvesting, alert),
  previousState: String (for alert recovery),

  currentPlanting: String (UUID, indexed),
  plantedDate: Date,
  estimatedHarvestDate: Date,

  alertId: String (UUID),
  alertDescription: String,
  alertTriggeredAt: Date,

  isActive: Boolean,
  createdAt: Date,
  updatedAt: Date
}

// Indexes
db.blocks.createIndex({ blockId: 1 }, { unique: true })
db.blocks.createIndex({ farmId: 1 })
db.blocks.createIndex({ state: 1 })
db.blocks.createIndex({ currentPlanting: 1 })
db.blocks.createIndex({ estimatedHarvestDate: 1 })
db.blocks.createIndex({ createdAt: -1 })
```

#### 3. plant_data
```javascript
{
  _id: ObjectId,
  plantDataId: String (UUID, indexed unique),
  plantName: String (indexed),
  scientificName: String,
  plantType: String (indexed),

  growthCycleDays: Number,

  minTemperatureCelsius: Number,
  maxTemperatureCelsius: Number,
  optimalPHMin: Number,
  optimalPHMax: Number,

  wateringFrequencyDays: Number,
  sunlightHoursDaily: String,
  fertilizationScheduleDays: Number,
  pesticideScheduleDays: Number,

  expectedYieldPerPlant: Number,
  yieldUnit: String,

  notes: String,
  tags: [String],

  dataVersion: Number,

  createdBy: String (UUID),
  createdByEmail: String,
  createdAt: Date,
  updatedAt: Date
}

// Indexes
db.plant_data.createIndex({ plantDataId: 1 }, { unique: true })
db.plant_data.createIndex({ plantName: 1 })
db.plant_data.createIndex({ plantType: 1 })
db.plant_data.createIndex({ tags: 1 })
db.plant_data.createIndex({ createdAt: -1 })
```

#### 4. plantings
```javascript
{
  _id: ObjectId,
  plantingId: String (UUID, indexed unique),
  blockId: String (UUID, indexed),
  farmId: String (UUID, indexed),

  plants: [
    {
      plantDataId: String (UUID),
      plantName: String,
      quantity: Number,
      plantDataSnapshot: Object (frozen plant data)
    }
  ],
  totalPlants: Number,

  plannedBy: String (UUID),
  plannedByEmail: String,
  plannedAt: Date,

  plantedBy: String (UUID),
  plantedByEmail: String,
  plantedAt: Date,

  estimatedHarvestStartDate: Date,
  estimatedHarvestEndDate: Date,

  predictedYield: Number,
  yieldUnit: String,

  status: String (enum: planned, planted, harvesting, completed),

  createdAt: Date,
  updatedAt: Date
}

// Indexes
db.plantings.createIndex({ plantingId: 1 }, { unique: true })
db.plantings.createIndex({ blockId: 1 })
db.plantings.createIndex({ farmId: 1 })
db.plantings.createIndex({ status: 1 })
db.plantings.createIndex({ estimatedHarvestStartDate: 1 })
db.plantings.createIndex({ createdAt: -1 })
```

#### 5. harvests
```javascript
{
  _id: ObjectId,
  harvestId: String (UUID, indexed unique),
  plantingId: String (UUID, indexed),
  blockId: String (UUID, indexed),
  farmId: String (UUID, indexed),

  entries: [
    {
      plantDataId: String (UUID),
      plantName: String,
      quantityHarvested: Number,
      qualityGrade: String,
      notes: String
    }
  ],
  totalQuantity: Number,
  yieldUnit: String,

  predictedYield: Number,
  yieldEfficiency: Number (percentage),

  harvestedBy: String (UUID),
  harvestedByEmail: String,
  harvestStartDate: Date,
  harvestEndDate: Date,

  notes: String,

  createdAt: Date,
  updatedAt: Date
}

// Indexes
db.harvests.createIndex({ harvestId: 1 }, { unique: true })
db.harvests.createIndex({ plantingId: 1 })
db.harvests.createIndex({ blockId: 1 })
db.harvests.createIndex({ farmId: 1 })
db.harvests.createIndex({ harvestEndDate: -1 })
db.harvests.createIndex({ createdAt: -1 })
```

#### 6. farm_assignments
```javascript
{
  _id: ObjectId,
  assignmentId: String (UUID, indexed unique),
  userId: String (UUID, indexed),
  userEmail: String,
  farmId: String (UUID, indexed),

  assignedBy: String (UUID),
  assignedByEmail: String,
  role: String (enum: manager, farmer),

  isActive: Boolean,

  createdAt: Date,
  updatedAt: Date
}

// Indexes
db.farm_assignments.createIndex({ assignmentId: 1 }, { unique: true })
db.farm_assignments.createIndex({ userId: 1 })
db.farm_assignments.createIndex({ farmId: 1 })
db.farm_assignments.createIndex({ userId: 1, farmId: 1 }, { unique: true })
db.farm_assignments.createIndex({ isActive: 1 })
```

---



---

**[← Back to Index](./README.md)**
