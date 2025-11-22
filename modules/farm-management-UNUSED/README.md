# Farm Management Module

**Version**: 1.0.0
**Status**: Development
**Platform**: A64 Core Platform

---

## Overview

Comprehensive farm management system for agricultural operations. Manages farms, blocks, plantings, harvests, and inventory with complete historical tracking for analytics and AI training.

## Features

### MVP (v1.0.0)

- ✅ **Farm Management**: Create and manage farm locations
- ✅ **Block Management**: Organize farms into plantable blocks
- ✅ **Plant Data Library**: CSV-importable plant cultivation requirements
- 🔄 **Planting Planning**: Plan what to plant and predict yields
- 🔄 **Daily Harvest Tracking**: Record incremental daily harvests
- 🔄 **Alert System**: 4-level severity alerts with escalation
- 🔄 **Block Cycle History**: Complete historical tracking for analytics
- 🔄 **Stock Inventory**: Integration with Sales, Logistics modules

## Architecture

```
modules/farm-management/
├── src/
│   ├── api/v1/          # API routes
│   ├── models/          # Pydantic models (10 entities)
│   ├── services/        # Business logic
│   │   ├── database.py  # MongoDB manager
│   │   └── farm/        # Farm service & repository
│   ├── middleware/      # Auth & permissions
│   ├── config/          # Settings
│   ├── utils/           # Response models
│   └── main.py          # FastAPI app
├── tests/               # Tests
├── docs/                # Documentation
├── requirements.txt     # Dependencies
└── README.md
```

## API Endpoints

### Implemented

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/health` | Health check | No |
| GET | `/` | Module info | No |
| POST | `/api/v1/farm/farms` | Create farm | Yes (farm.manage) |
| GET | `/api/v1/farm/farms` | List farms | Yes |
| GET | `/api/v1/farm/farms/{id}` | Get farm | Yes |
| PATCH | `/api/v1/farm/farms/{id}` | Update farm | Yes (owner) |
| DELETE | `/api/v1/farm/farms/{id}` | Delete farm | Yes (owner) |
| GET | `/api/v1/farm/farms/{id}/summary` | Farm summary | Yes |

### Plant Data API (Enhanced Schema)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/v1/farm/plant-data-enhanced` | Create enhanced plant data | Yes (agronomist) |
| GET | `/api/v1/farm/plant-data-enhanced` | Search plant data (filters, pagination) | Yes |
| GET | `/api/v1/farm/plant-data-enhanced/{id}` | Get specific plant data | Yes |
| PATCH | `/api/v1/farm/plant-data-enhanced/{id}` | Update plant data (increments version) | Yes (agronomist) |
| DELETE | `/api/v1/farm/plant-data-enhanced/{id}` | Soft delete plant data | Yes (agronomist) |
| POST | `/api/v1/farm/plant-data-enhanced/{id}/clone` | Clone plant data with new name | Yes (agronomist) |
| GET | `/api/v1/farm/plant-data-enhanced/template/csv` | Download CSV template | Yes |
| GET | `/api/v1/farm/plant-data-enhanced/by-farm-type/{type}` | Get plants by farm type | Yes |
| GET | `/api/v1/farm/plant-data-enhanced/by-tags/{tags}` | Get plants by tags | Yes |

**Query Parameters for Search**:
- `page` (int): Page number (default: 1)
- `perPage` (int): Items per page (default: 20, max: 100)
- `search` (string): Text search on name, scientific name, tags
- `farmType` (enum): Filter by farm type (open_field, greenhouse, hydroponic, vertical_farm, aquaponic)
- `minGrowthCycle` (int): Minimum growth cycle days
- `maxGrowthCycle` (int): Maximum growth cycle days
- `tags` (string): Comma-separated tags

### Coming Soon

- Blocks (CRUD + state management)
- Plant Data Legacy (backward compatibility API)
- Plantings (planning + execution)
- Daily Harvests (incremental recording)
- Alerts (trigger + resolve)
- Block Cycles (historical queries)
- Stock Inventory (for module integration)

## Installation

### Prerequisites

- Python 3.11+
- MongoDB (via A64Core)
- A64Core running (for authentication)

### Setup

1. **Install dependencies**:
   ```bash
   cd modules/farm-management
   pip install -r requirements.txt
   ```

2. **Environment variables** (`.env`):
   ```bash
   # MongoDB (from A64Core)
   MONGODB_URL=mongodb://mongodb:27017
   MONGODB_DB_NAME=a64core

   # Authentication (from A64Core)
   SECRET_KEY=your-secret-key-here

   # A64Core API
   A64CORE_API_URL=http://api:8000

   # Email notifications (optional)
   ENABLE_EMAIL_NOTIFICATIONS=true
   EMAIL_FROM=noreply@a64core.com
   ```

3. **Run the module**:
   ```bash
   cd src
   python -m uvicorn main:app --reload --port 8001
   ```

4. **Access API docs**:
   - Swagger UI: http://localhost:8001/docs
   - ReDoc: http://localhost:8001/redoc

## Database

### Collections

| Collection | Purpose | Indexes |
|------------|---------|---------|
| `farms` | Farm locations | farmId (unique), managerId |
| `blocks` | Planting areas | blockId (unique), farmId, state |
| `plant_data` | Plant requirements (legacy) | plantDataId (unique), plantName |
| `plant_data_enhanced` | Comprehensive plant data | plantDataId (unique), plantName, scientificName (unique), farmTypeCompatibility, tags, growthCycle.totalCycleDays, deletedAt (sparse), text search index |
| `plantings` | Planting records | plantingId (unique), blockId |
| `daily_harvests` | Daily harvests | dailyHarvestId (unique), cycleId |
| `harvests` | Harvest summaries | harvestId (unique), plantingId |
| `alerts` | Issue tracking | alertId (unique), severity, status |
| `block_cycles` | Historical cycles | cycleId (unique), blockId + cycleNumber |
| `stock_inventory` | Stock tracking | inventoryId (unique), farmId + plantDataId |
| `farm_assignments` | User access | assignmentId (unique), userId + farmId |

### Database Initialization

Run the database initialization script to create all required indexes:

```bash
cd modules/farm-management
python -m src.utils.db_init
```

Or import and use programmatically:

```python
from src.utils.db_init import DatabaseInitializer

# Initialize all indexes
results = await DatabaseInitializer.initialize_all(db)
```

## Authentication

Uses A64Core JWT authentication:

1. Login via A64Core: `POST /api/v1/auth/login`
2. Get access token
3. Use token: `Authorization: Bearer {token}`

### Permissions

| Permission | Description | Roles |
|------------|-------------|-------|
| `farm.manage` | Manage farms/blocks/plantings | Admin, Manager |
| `farm.operate` | Plant, harvest, alerts | User, Manager, Admin |
| `agronomist` | Manage plant data library | Admin, Manager |

## Development

### Data Models

10 Pydantic models implemented:
1. Farm
2. Block (with BlockState enum)
3. PlantData
4. Planting
5. DailyHarvest
6. Harvest
7. Alert (with AlertSeverity, AlertStatus enums)
8. BlockCycle
9. StockInventoryItem
10. FarmAssignment

### Testing

```bash
# Run tests (when implemented)
pytest tests/

# Run with coverage
pytest tests/ --cov=src
```

### Code Quality

```bash
# Type checking
mypy src/

# Linting
pylint src/

# Format
black src/
```

## Integration

### With A64Core

- **Authentication**: Uses A64Core JWT tokens
- **Database**: Shares A64Core MongoDB database
- **Users**: References A64Core users collection

### With Other Modules

**Stock Inventory** exposes harvest data for:
- Sales Module: Available inventory for orders
- Logistics Module: Shipping and distribution
- Inventory Management Module: Stock levels, reorder points

## Plant Data Enhanced Schema

### Overview

The enhanced plant data schema provides comprehensive agronomic information for precision agriculture. It includes 13 major field groups covering all aspects of plant cultivation.

### Schema Structure

```typescript
PlantDataEnhanced {
  // 1. Basic Information
  plantDataId: UUID
  plantName: string (unique)
  scientificName: string (unique)
  farmTypeCompatibility: FarmTypeEnum[] // open_field, greenhouse, hydroponic, vertical_farm, aquaponic

  // 2. Growth Cycle (detailed breakdown)
  growthCycle: {
    germinationDays: int
    vegetativeDays: int
    floweringDays: int
    fruitingDays: int
    harvestDurationDays: int
    totalCycleDays: int // Must equal sum of stages
  }

  // 3. Yield & Waste
  yieldInfo: {
    yieldPerPlant: float
    yieldUnit: string
    expectedWastePercentage: float (0-100)
  }

  // 4. Fertilizer Schedule (by growth stage)
  fertilizerSchedule: [{
    stage: GrowthStageEnum
    fertilizerType: string
    quantityPerPlant: float
    quantityUnit: string
    frequencyDays: int
    npkRatio: string (optional)
    notes: string (optional)
  }]

  // 5. Pesticide Schedule (with safety info)
  pesticideSchedule: [{
    stage: GrowthStageEnum
    pesticideType: string
    targetPest: string (optional)
    quantityPerPlant: float
    quantityUnit: string
    frequencyDays: int
    safetyNotes: string (optional)
    preharvestIntervalDays: int (optional)
  }]

  // 6. Environmental Requirements
  environmentalRequirements: {
    temperature: {
      minCelsius: float
      maxCelsius: float
      optimalCelsius: float (must be within min-max)
    }
    humidity: {
      minPercentage: float (0-100)
      maxPercentage: float (0-100)
      optimalPercentage: float (0-100)
    } (optional)
    co2RequirementPpm: int (optional)
    airCirculation: string (optional)
  }

  // 7. Watering Requirements
  wateringRequirements: {
    frequencyDays: int
    waterType: WaterTypeEnum // tap, filtered, ro, rainwater, distilled
    amountPerPlantLiters: float (optional)
    droughtTolerance: ToleranceLevelEnum // low, medium, high
    notes: string (optional)
  }

  // 8. Soil & pH Requirements
  soilRequirements: {
    phRequirements: {
      minPH: float (0-14)
      maxPH: float (0-14)
      optimalPH: float (0-14, must be within min-max)
    }
    soilTypes: SoilTypeEnum[] // loamy, sandy, clay, silty, peaty, chalky
    nutrientsRecommendations: string (optional)
    ecRangeMs: string (optional, for hydroponics)
    tdsRangePpm: string (optional, for hydroponics)
    notes: string (optional)
  }

  // 9. Diseases & Pests
  diseasesAndPests: [{
    name: string
    symptoms: string
    preventionMeasures: string
    treatmentOptions: string
    severity: SeverityLevelEnum // low, medium, high, critical
  }]

  // 10. Light Requirements
  lightRequirements: {
    lightType: LightTypeEnum // full_sun, partial_shade, full_shade, filtered_light
    minHoursDaily: float (0-24)
    maxHoursDaily: float (0-24)
    optimalHoursDaily: float (0-24)
    intensityLux: int (optional, for indoor)
    intensityPpfd: int (optional, for indoor)
    photoperiodSensitive: bool
    notes: string (optional)
  }

  // 11. Quality Grading Standards
  gradingStandards: [{
    gradeName: string
    sizeRequirements: string (optional)
    colorRequirements: string (optional)
    defectTolerance: string (optional)
    otherCriteria: string (optional)
    priceMultiplier: float (optional, e.g., 1.5 = 150% of base price)
  }]

  // 12. Economics & Labor
  economicsAndLabor: {
    averageMarketValuePerKg: float (optional)
    currency: string
    totalManHoursPerPlant: float
    plantingHours: float (optional)
    maintenanceHours: float (optional)
    harvestingHours: float (optional)
    notes: string (optional)
  }

  // 13. Additional Information
  additionalInfo: {
    growthHabit: GrowthHabitEnum // determinate, indeterminate, bush, vine, climbing, spreading
    spacing: {
      betweenPlantsCm: float
      betweenRowsCm: float
      plantsPerSquareMeter: float (optional)
    }
    supportRequirements: SupportTypeEnum // none, trellis, stakes, cage, net, pole
    companionPlants: string[] (optional)
    incompatiblePlants: string[] (optional)
    notes: string (optional)
  }

  // Metadata
  tags: string[] (optional, for search/categorization)
  dataVersion: int (auto-incremented on updates)
  createdBy: UUID
  createdByEmail: string
  createdAt: datetime
  updatedAt: datetime
  deletedAt: datetime (null = active, set = soft deleted)
}
```

### Sample Data

Sample comprehensive plant data for tomato, lettuce, and strawberry is available in:
- `modules/farm-management/docs/plant_data_samples.json`

### Database Indexes

The enhanced schema uses 10 strategic indexes for optimal query performance:

1. **Primary Key** (unique): `plantDataId`
2. **Plant Name**: `plantName`
3. **Scientific Name** (unique, partial): `scientificName`
4. **Farm Type Compatibility**: `farmTypeCompatibility`
5. **Tags**: `tags`
6. **Growth Cycle**: `growthCycle.totalCycleDays`
7. **Soft Delete** (sparse): `deletedAt`
8. **Created By** (compound): `createdBy + createdAt`
9. **Active Records** (compound): `deletedAt + updatedAt`
10. **Text Search** (weighted): `plantName, scientificName, tags, additionalInfo.notes`

### API Usage Examples

**Create Enhanced Plant Data**:
```bash
curl -X POST "http://localhost:8001/api/v1/farm/plant-data-enhanced" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d @plant_data.json
```

**Search with Filters**:
```bash
# Search by text
curl "http://localhost:8001/api/v1/farm/plant-data-enhanced?search=tomato"

# Filter by farm type
curl "http://localhost:8001/api/v1/farm/plant-data-enhanced?farmType=hydroponic"

# Filter by growth cycle range (30-60 days)
curl "http://localhost:8001/api/v1/farm/plant-data-enhanced?minGrowthCycle=30&maxGrowthCycle=60"

# Filter by tags
curl "http://localhost:8001/api/v1/farm/plant-data-enhanced?tags=vegetable,summer"

# Combine filters with pagination
curl "http://localhost:8001/api/v1/farm/plant-data-enhanced?search=lettuce&farmType=vertical_farm&page=1&perPage=20"
```

**Update Plant Data** (increments version):
```bash
curl -X PATCH "http://localhost:8001/api/v1/farm/plant-data-enhanced/{plantDataId}" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "yieldInfo": {
      "yieldPerPlant": 6.0,
      "yieldUnit": "kg",
      "expectedWastePercentage": 12.0
    }
  }'
```

**Clone Plant Data**:
```bash
curl -X POST "http://localhost:8001/api/v1/farm/plant-data-enhanced/{plantDataId}/clone?newName=Tomato%20-%20Cherry" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Migration from Legacy Schema

Use the `PlantDataMigrationMapper` utility to convert between legacy and enhanced schemas:

```python
from src.utils.plant_data_mapper import PlantDataMigrationMapper

# Convert legacy to enhanced
enhanced = PlantDataMigrationMapper.legacy_to_enhanced(legacy_plant)

# Convert enhanced to legacy (for backward compatibility)
legacy = PlantDataMigrationMapper.enhanced_to_legacy(enhanced_plant)
```

## Documentation

- **Planning**: `/Docs/2-Working-Progress/farm-management-module.md`
- **DevLog**: `/Docs/3-DevLog/2025-10-28-farm-module-implementation-start.md`
- **API Docs**: http://localhost:8001/docs (when running)
- **Plant Data Samples**: `/modules/farm-management/docs/plant_data_samples.json`

## Roadmap

### Phase 1: Foundation (Current)
- ✅ Data models
- ✅ Database layer
- ✅ Farm service & API
- 🔄 Block service & API
- 🔄 Plant Data service & API

### Phase 2: Core Features (Week 3-4)
- Planting planning
- Daily harvest recording
- Alert system

### Phase 3: History & Analytics (Week 5)
- Block cycle tracking
- Stock inventory
- Yield predictions

### Phase 4: Frontend (Week 6-8)
- React + TypeScript
- Dashboards (Manager, Farmer)
- CSV import UI

## Support

- **Issues**: GitHub Issues
- **Documentation**: `/Docs/`
- **DevLog**: Track implementation progress

---

## License

Proprietary - A64 Core Platform

## Version History

- **1.0.0-dev** (2025-10-28): Initial implementation
  - Data models complete (10/10)
  - Database layer with indexes
  - Farm CRUD API
  - Authentication integration
