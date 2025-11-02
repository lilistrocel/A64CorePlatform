# Farm Management Module - Overview & Architecture

## Executive Summary

### What is the Farm Management Module?

A comprehensive farm management system that enables agronomists to define plant requirements, farm managers to plan cultivation, and farmers to execute and track agricultural operations.

### Core Functionality (MVP)

1. **Plant Data Management** - Agronomists input/import plant cultivation requirements
2. **Farm & Block Management** - Organize farms into plantable blocks
3. **Planting Planning** - Farm managers plan what to plant and predict yields
4. **Cultivation Tracking** - Farmers track planting, harvesting, and alerts
5. **Yield Prediction** - Calculate expected harvest based on plant data

### Key Design Decisions

- **Separate Module**: Not a CCM, but standalone module that integrates with A64Core
- **Data Storage**: Uses A64Core's database (shared data architecture)
- **Multi-Tenancy**: Each organization has separate A64Core instance (data isolation)
- **CSV Import**: Plant data imported via CSV template
- **Simple Yield Calculation**: MVP uses Plant Data expected yield × quantity (no complex factors yet)

---

## Clarifications & Decisions

### 1. Module Structure ✅ CONFIRMED
**Decision**: Separate application module
- Runs as independent Docker container
- Communicates with A64Core API for user auth and shared data
- Has own API endpoints under `/api/v1/farm/`
- Data stored in A64Core's MongoDB (shared collections)

### 2. Plant Data Management ✅ CONFIRMED
**Decisions**:
- Global plant database shared across organization (not per-farm)
- **CSV Import Strategy**: Incremental updates (update existing, add new)
- Plant data is versioned by `dataVersion` - blocks store the version they were planted with
- **Once planted, blocks use FROZEN plant data** (no retroactive changes)
- Only imported when agronomists have new/better data

**CSV Template Fields**:
```csv
plantName,scientificName,plantType,growthCycleDays,minTemperatureCelsius,maxTemperatureCelsius,optimalPHMin,optimalPHMax,wateringFrequencyDays,sunlightHoursDaily,expectedYieldPerPlant,yieldUnit,fertilizationScheduleDays,pesticideScheduleDays,notes
Tomato,Solanum lycopersicum,Crop,90,15,30,6.0,6.8,3,6-8,5,kg,14,21,Requires staking
```

### 3. Block Structure & Capacity ✅ CONFIRMED
**Hierarchy**: Organization → Farms → Blocks → Plants

**Multi-Plant Blocks**:
- Plants are planted **together** (companion planting)
- Farm manager sets `maxPlants` for the entire block
- Farm manager chooses multiple plant types and quantities (total ≤ maxPlants)
- **HARD LIMIT**: System **prevents** exceeding maxPlants (validation error)
- Example: Block can have 50 tomatoes + 30 basil = 80 plants (if maxPlants = 100)

**Block State Transitions**:
```
Empty → Planned → Planted → Harvesting → Empty
         ↓          ↓            ↓
      [Alert] ← [Alert] ←← [Alert]
```

- **Empty → Planned**: Farm manager plans what to plant (manual)
- **Planned → Planted**: Farmer manually marks planted (records planting date)
- **Planted → Harvesting**: Automatic transition when first plant reaches harvest window
- **Harvesting → Empty**: **Farm manager decides** when harvest ends (not automatic)
- **Alert State**: Temporary state, farmers trigger alerts with severity levels

### 4. Block History & Cycles ✅ NEW REQUIREMENT
**Critical Concept**: Each block goes through multiple cycles over time. Each cycle must be tracked as historical data.

**Block Cycle**:
A cycle represents one complete planting-to-harvest sequence on a block.

**Block History Tracking**:
- Every cycle creates a `BlockCycle` record
- Stores: planting data, harvest data, alerts, timeline, yield efficiency
- Used for: analytics, AI training, performance tracking, trend analysis

**What's Tracked Per Cycle**:
- Cycle number (1, 2, 3, ...)
- Plant types and quantities planted
- Frozen plant data at time of planting
- Planting date, estimated harvest date, actual harvest dates
- All harvest records (daily harvests aggregated)
- All alerts that occurred during cycle
- Yield efficiency (predicted vs actual)
- Cycle duration (days from planting to final harvest)
- Environmental conditions (future: temperature, rainfall)

### 5. Daily Harvest Recording ✅ CONFIRMED
**Key Requirement**: Harvests occur daily and are recorded incrementally.

**Daily Harvest Workflow**:
1. Block enters HARVESTING state (automatic)
2. Farmer harvests daily over multiple days
3. Each day's harvest recorded separately:
   - Date of harvest
   - Quantity per plant type
   - Quality grade
   - Notes
4. **Aggregated into Stock Inventory** (for other modules)
5. Farm manager decides when harvesting is complete
6. Final harvest triggers cycle completion

**Stock Inventory Integration**:
- Each daily harvest updates farm's stock inventory
- Stock inventory tracks: product type, quantity, quality grade, harvest date
- **Other modules can consume this data**:
  - Logistics module: Shipping and distribution
  - Sales module: Available inventory for orders
  - Inventory Management module: Stock levels, reorder points

### 6. Alert System with Severity ✅ CONFIRMED
**Alert Severity Levels**:
- **Low**: Minor issues, no immediate action required (e.g., slight discoloration)
- **Medium**: Requires attention within 24-48 hours (e.g., low water pressure)
- **High**: Requires immediate attention (e.g., pest infestation)
- **Critical**: Emergency, immediate action required (e.g., irrigation failure, severe disease outbreak)

**Severity-Based Workflows**:
| Severity | Notification Channels | Response Time | Escalation |
|----------|----------------------|---------------|------------|
| Low | In-app only | 48-72 hours | None |
| Medium | In-app + Email | 24-48 hours | Escalate to manager after 48h |
| High | In-app + Email | 6-12 hours | Escalate to manager after 12h |
| Critical | In-app + Email + SMS (future) | Immediate | Immediate manager notification |

**Alert Workflow**:
1. Farmer triggers alert with severity
2. System sends notifications based on severity
3. Alert appears on dashboards with color coding
4. Farm manager receives notification
5. Farmer/Manager resolves alert with resolution notes
6. Alert is stored in block cycle history

### 7. Harvest Timeline Deviations ✅ CONFIRMED
**Visual Indicators for Timeline Issues**:

**Color Coding for Harvest Status**:
- **Green**: Harvest on schedule (within estimated window)
- **Yellow**: Harvest delayed 1-3 days (warning)
- **Orange**: Harvest delayed 4-7 days (concern)
- **Red**: Harvest delayed >7 days (critical - quality may be affected)

**Dashboard Indicators**:
- Days overdue badge on block cards
- Alert icon if harvest significantly delayed
- Predicted yield adjustment (may decrease with delay)

### 8. User Roles & Permissions ✅ CONFIRMED
**Mapping to A64Core Roles**:
- **Agronomist**: Custom permission `agronomist` (can be assigned to any role, typically Manager)
- **Farm Manager**: Manager role + `farm.manage` permission
- **Farmer**: User role + `farm.operate` permission

**Multi-Role Support**:
- **Farms can have multiple managers** (co-managers)
- **Users can have different roles on different farms**:
  - Manager on Farm A
  - Farmer on Farm B
- **Role assignments managed by Admins/Super Admins**

**Farm Assignment**:
- Users can be assigned to one or multiple farms via `farm_assignments` collection
- Permissions checked at farm level (user can only access assigned farms)

### 5. Data Relationships
**Multi-Tenancy**:
- Each organization has separate A64Core instance
- Data is automatically isolated by organization
- No need for explicit `organizationId` in every document (A64Core handles this)

**Block Ownership**:
- Blocks belong to Farms
- Farms belong to Organizations (implicit via A64Core instance)
- Users assigned to Farms via `farm_assignments`

### 6. Yield Prediction (MVP)
**Simple Calculation**:
```
Predicted Yield = Σ (expectedYieldPerPlant × plantedQuantity) for each plant type in block
```

**Example**:
- Block has 50 tomato plants (5 kg/plant) + 30 basil plants (0.5 kg/plant)
- Predicted yield = (50 × 5) + (30 × 0.5) = 250 + 15 = 265 kg total

**Future Enhancements** (not MVP):
- Environmental factors (actual temperature, rainfall)
- Soil quality adjustments
- Historical yield data
- Pest/disease impact

### 7. Technology Stack
**Backend**:
- Python 3.11 + FastAPI (matches A64Core)
- Motor (async MongoDB driver)
- Pydantic models for validation
- Docker containerized

**Frontend**:
- React + TypeScript
- Styled-components (UI-Standards.md)
- Recharts for yield visualization
- React Grid Layout for farm/block layout view

**Database**:
- MongoDB (A64Core's database)
- Collections: `farms`, `blocks`, `plant_data`, `plantings`, `daily_harvests`, `block_cycles`, `alerts`, `stock_inventory`, `farm_assignments`

### 8. Historical Data Retention Strategy ✅ CONFIRMED

**Purpose**: All farm data is valuable for historical analytics, trend analysis, performance tracking, and AI model training.

**Data Retention Policy**:

#### Permanent Retention (Never Delete):
- **Block Cycles**: Complete historical record of all planting cycles
- **Plant Data**: All versions of plant data (versioned history)
- **Farms & Blocks**: Fa rm and block metadata (soft delete, recoverable)
- **Farm Assignments**: User assignment history

#### Long-Term Retention (5+ Years):
- **Daily Harvests**: Individual daily harvest records (aggregated in cycles)
- **Alerts**: All alert records with resolution notes
- **Plantings**: All planting plans and executions

#### Medium-Term Retention (2-3 Years):
- **Stock Inventory**: Historical stock movements (after consumed/expired)

#### Data Archiving Strategy:

**Hot Data** (MongoDB - Active Collections):
- Current/active cycles (status = "active")
- Recent 12 months of completed cycles
- Current stock inventory
- Recent 6 months of alerts

**Warm Data** (MongoDB - Archive Collections):
- Completed cycles older than 12 months → `block_cycles_archive`
- Resolved alerts older than 6 months → `alerts_archive`
- Consumed stock older than 3 months → `stock_inventory_archive`

**Cold Data** (External Storage - S3/Azure Blob):
- Cycles older than 5 years → JSON/Parquet files
- Indexed for AI training and big data analytics
- Queryable but slower access

**Data Lifecycle**:
```
Active Data (0-12 months)
    ↓ Monthly archival job
Warm Data (1-5 years)
    ↓ Annual archival job
Cold Data (5+ years)
    ↓ Never deleted (permanent storage)
```

**Analytics & AI Training Use Cases**:
1. **Yield Prediction Models**:
   - Train on historical cycles: plants, conditions, actual yields
   - Features: plant types, quantities, weather, soil, alerts
   - Target: yield efficiency

2. **Pest/Disease Detection**:
   - Train on alert history: descriptions, severity, outcomes
   - Predict likelihood of issues based on conditions

3. **Optimal Planting Strategies**:
   - Analyze historical cycles: which combinations work best
   - Recommend plant mixes, planting dates

4. **Farm Performance Analytics**:
   - Compare blocks, farms, seasons
   - Identify high/low performers
   - Trend analysis over years

5. **Inventory Forecasting**:
   - Predict harvest quantities and timing
   - Optimize stock levels

**Data Export APIs** (for Analytics/AI):
```
GET /api/v1/farm/analytics/cycles/export
  - Export historical cycle data for AI training
  - Filters: date range, farms, plant types
  - Formats: JSON, CSV, Parquet

GET /api/v1/farm/analytics/yields/historical
  - Historical yield data aggregated
  - Group by: farm, block, plant type, season

GET /api/v1/farm/analytics/alerts/patterns
  - Alert patterns and resolutions
  - For predictive models
```

**Database Sizing Estimates** (5-year projection):
- **Block Cycles**: 1000 farms × 50 blocks × 4 cycles/year × 5 years = 1M records (~2GB)
- **Daily Harvests**: 1M cycles × 7 harvest days avg = 7M records (~14GB)
- **Alerts**: 1M cycles × 2 alerts avg = 2M records (~4GB)
- **Total (5 years)**: ~20-30GB (highly compressible)

**Backup Strategy**:
- Daily incremental backups (active data)
- Weekly full backups (all data)
- Monthly backups to cold storage
- Geo-redundant storage for disaster recovery

**Data Privacy & Compliance**:
- User consent for data usage in AI training
- Anonymization options for multi-tenant analytics
- GDPR compliance: Right to erasure (soft delete, mark anonymized)
- Data export for users (GDPR right to portability)

### 9. Notifications & Email Strategy ✅ CONFIRMED

**Notification Channels**:
1. **In-App Notifications** (always sent):
   - Real-time notifications in dashboard
   - Badge counters for unread
   - Notification center with history

2. **Email Notifications** (configurable per user):
   - Alert notifications (severity-based)
   - Harvest ready notifications
   - Daily/weekly summaries
   - Report generation complete

3. **SMS Notifications** (future, critical only):
   - Critical alerts only
   - Opt-in per user
   - Rate-limited to avoid spam

**Email Notification Types**:

| Event | Recipients | Frequency | Severity Filter |
|-------|-----------|-----------|-----------------|
| Alert Triggered | Assigned farmers + farm managers | Immediate | Medium, High, Critical |
| Alert Escalated | Farm managers | After timeout | High, Critical |
| Harvest Ready | Assigned farmers | Daily | N/A |
| Harvest Overdue | Assigned farmers + managers | Daily | N/A |
| Daily Summary | Farm managers (opt-in) | Daily 6 AM | N/A |
| Weekly Report | Farm managers (opt-in) | Weekly Mon 6 AM | N/A |

**Email Templates**:
- Professional, branded templates
- Clear call-to-action buttons
- Unsubscribe options (per email type)
- Mobile-responsive design

**Email Service Integration**:
- Use A64Core's email service (SendGrid/SES)
- Centralized email queue
- Rate limiting (avoid spam flags)
- Bounce/complaint handling

### 10. MVP Scope

**In Scope**:
1. ✅ Plant Data CRUD (Create, Read, Update, Delete)
2. ✅ CSV import for plant data (downloadable template)
3. ✅ Farm CRUD
4. ✅ Block CRUD with states and max capacity
5. ✅ Planning: Assign plants to blocks (validate max capacity)
6. ✅ Planting: Farmer marks planted (state transition, records date)
7. ✅ Harvesting: Automatic transition to harvesting state, farmer records harvest quantity and ends harvest
8. ✅ Alert system: Farmer triggers alerts, records issue, resolves
9. ✅ Simple yield prediction (plant data × quantity)
10. ✅ Farm manager dashboard (view all farms, blocks, status summary)
11. ✅ Farmer dashboard (view assigned farms, tasks, alerts)

**Out of Scope** (Future Phases):
- ❌ Task scheduling/automation
- ❌ Real-time environmental monitoring (IoT sensors)
- ❌ Advanced analytics/reporting
- ❌ Mobile app
- ❌ Weather integration
- ❌ Soil testing integration
- ❌ Pest/disease management
- ❌ Equipment tracking
- ❌ Labor management
- ❌ Financial tracking (costs, revenue)

---

## Module Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      USER PORTAL FRONTEND                        │
│                   (React + TypeScript)                           │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │           Farm Management UI Components                │    │
│  │                                                         │    │
│  │  - Farm Dashboard                                      │    │
│  │  - Block Management                                    │    │
│  │  - Plant Data Manager                                  │    │
│  │  - Planting Planner                                    │    │
│  │  - Harvest Tracker                                     │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                  │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ HTTP/REST API
                         │
┌────────────────────────▼────────────────────────────────────────┐
│                   A64CORE API (FastAPI)                         │
│                                                                  │
│  ┌──────────────────┐         ┌─────────────────────────┐      │
│  │  Auth & RBAC     │         │  Farm Module Routes     │      │
│  │  /api/v1/auth/*  │◄────────┤  /api/v1/farm/*         │      │
│  │                  │         │                         │      │
│  │  - JWT tokens    │         │  - Farms                │      │
│  │  - User roles    │         │  - Blocks               │      │
│  │  - Permissions   │         │  - Plant Data           │      │
│  └──────────────────┘         │  - Plantings            │      │
│                                │  - Harvests             │      │
│                                └─────────────────────────┘      │
│                                          │                       │
└──────────────────────────────────────────┼───────────────────────┘
                                           │
                         ┌─────────────────▼──────────────────┐
                         │         MONGODB DATABASE            │
                         │                                     │
                         │  Collections:                       │
                         │  - users (A64Core)                  │
                         │  - farms (Farm Module)              │
                         │  - blocks (Farm Module)             │
                         │  - plant_data (Farm Module)         │
                         │  - plantings (Farm Module)          │
                         │  - harvests (Farm Module)           │
                         │  - farm_assignments (Farm Module)   │
                         └─────────────────────────────────────┘
```

### Service Layer Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     API LAYER (FastAPI)                      │
│   /api/v1/farm/                                              │
│   - farms.py                                                 │
│   - blocks.py                                                │
│   - plant_data.py                                            │
│   - plantings.py                                             │
│   - harvests.py                                              │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                  SERVICE LAYER (Business Logic)              │
│   src/services/farm/                                         │
│   - farm_service.py      (Farm CRUD)                         │
│   - block_service.py     (Block CRUD, state management)      │
│   - plant_service.py     (Plant data CRUD, CSV import)       │
│   - planting_service.py  (Planting operations, validation)   │
│   - yield_service.py     (Yield predictions)                 │
│   - alert_service.py     (Alert management)                  │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                   DATA ACCESS LAYER                          │
│   src/services/database.py                                   │
│   - MongoDB connection manager                               │
│   - Database queries                                         │
└─────────────────────────────────────────────────────────────┘
```

---



---

**[← Back to Index](./README.md)**
