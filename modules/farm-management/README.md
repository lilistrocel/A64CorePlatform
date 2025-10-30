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

### Coming Soon

- Blocks (CRUD + state management)
- Plant Data (CRUD + CSV import)
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
| `plant_data` | Plant requirements | plantDataId (unique), plantName |
| `plantings` | Planting records | plantingId (unique), blockId |
| `daily_harvests` | Daily harvests | dailyHarvestId (unique), cycleId |
| `harvests` | Harvest summaries | harvestId (unique), plantingId |
| `alerts` | Issue tracking | alertId (unique), severity, status |
| `block_cycles` | Historical cycles | cycleId (unique), blockId + cycleNumber |
| `stock_inventory` | Stock tracking | inventoryId (unique), farmId + plantDataId |
| `farm_assignments` | User access | assignmentId (unique), userId + farmId |

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

## Documentation

- **Planning**: `/Docs/2-Working-Progress/farm-management-module.md`
- **DevLog**: `/Docs/3-DevLog/2025-10-28-farm-module-implementation-start.md`
- **API Docs**: http://localhost:8001/docs (when running)

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
