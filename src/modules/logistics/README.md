# Logistics Module

Fleet management, route planning, and shipment tracking system for A64 Core Platform.

## Version

1.0.0

## Description

The Logistics module provides comprehensive fleet management capabilities including:
- Vehicle management (trucks, vans, pickups, refrigerated vehicles)
- Route planning with origin/destination tracking
- Shipment management with status tracking
- Auto-generated codes for vehicles (V001), routes (R001), and shipments (SH001)

## Features

### Vehicles
- Create, read, update, delete vehicles
- Track vehicle types, ownership, capacity, and costs
- Monitor vehicle status (available, in_use, maintenance, retired)
- Maintenance scheduling
- Filter by status and type
- Get available vehicles endpoint

### Routes
- Create, read, update, delete routes
- Origin and destination with GPS coordinates
- Distance and duration tracking
- Cost estimation
- Active/inactive route management

### Shipments
- Create, read, update, delete shipments
- Link shipments to routes, vehicles, and drivers
- Status tracking (scheduled, in_transit, delivered, cancelled)
- Automatic departure/arrival date tracking
- Cargo manifest management
- Status transition validation

## API Endpoints

### Vehicles
```
GET    /api/v1/logistics/vehicles           # List vehicles (paginated)
POST   /api/v1/logistics/vehicles           # Create vehicle
GET    /api/v1/logistics/vehicles/{id}      # Get vehicle
PATCH  /api/v1/logistics/vehicles/{id}      # Update vehicle
DELETE /api/v1/logistics/vehicles/{id}      # Delete vehicle
GET    /api/v1/logistics/vehicles/available # Get available vehicles
```

### Routes
```
GET    /api/v1/logistics/routes             # List routes (paginated)
POST   /api/v1/logistics/routes             # Create route
GET    /api/v1/logistics/routes/{id}        # Get route
PATCH  /api/v1/logistics/routes/{id}        # Update route
DELETE /api/v1/logistics/routes/{id}        # Delete route
```

### Shipments
```
GET    /api/v1/logistics/shipments          # List shipments (paginated)
POST   /api/v1/logistics/shipments          # Create shipment
GET    /api/v1/logistics/shipments/{id}     # Get shipment
PATCH  /api/v1/logistics/shipments/{id}     # Update shipment
PATCH  /api/v1/logistics/shipments/{id}/status  # Update shipment status
DELETE /api/v1/logistics/shipments/{id}     # Delete shipment
```

## Database Collections

### vehicles
```json
{
  "vehicleId": "UUID",
  "vehicleCode": "V001",
  "name": "string",
  "type": "truck|van|pickup|refrigerated",
  "ownership": "owned|rented|leased",
  "licensePlate": "string",
  "capacity": {
    "weight": "number",
    "volume": "number",
    "unit": "kg|m3"
  },
  "status": "available|in_use|maintenance|retired",
  "costPerKm": "number",
  "rentalCostPerDay": "number",
  "purchaseDate": "date",
  "purchaseCost": "number",
  "maintenanceSchedule": "date",
  "createdBy": "UUID",
  "createdAt": "datetime",
  "updatedAt": "datetime"
}
```

### routes
```json
{
  "routeId": "UUID",
  "routeCode": "R001",
  "name": "string",
  "origin": {
    "name": "string",
    "address": "string",
    "coordinates": { "lat": "number", "lng": "number" }
  },
  "destination": {
    "name": "string",
    "address": "string",
    "coordinates": { "lat": "number", "lng": "number" }
  },
  "distance": "number",
  "estimatedDuration": "number (minutes)",
  "estimatedCost": "number",
  "isActive": "boolean",
  "createdBy": "UUID",
  "createdAt": "datetime",
  "updatedAt": "datetime"
}
```

### shipments
```json
{
  "shipmentId": "UUID",
  "shipmentCode": "SH001",
  "routeId": "UUID",
  "vehicleId": "UUID",
  "driverId": "UUID (employeeId from HR)",
  "status": "scheduled|in_transit|delivered|cancelled",
  "scheduledDate": "datetime",
  "actualDepartureDate": "datetime",
  "actualArrivalDate": "datetime",
  "cargo": [{
    "description": "string",
    "quantity": "number",
    "weight": "number"
  }],
  "totalCost": "number",
  "notes": "string",
  "createdBy": "UUID",
  "createdAt": "datetime",
  "updatedAt": "datetime"
}
```

## Permissions

- `logistics.view` - View vehicles, routes, and shipments
- `logistics.create` - Create new vehicles, routes, and shipments
- `logistics.edit` - Update existing vehicles, routes, and shipments
- `logistics.delete` - Delete vehicles, routes, and shipments

## Dependencies

- `core`: >=1.3.0
- `python`: >=3.11
- Shared MongoDB connection from core services
- JWT authentication from A64Core

## Integration

### HR Module Integration
The Logistics module integrates with the HR module for driver management:
- `shipments.driverId` references `employees.employeeId` from HR module
- Drivers must be valid employees in the system

### Authentication
- Uses A64Core's JWT authentication system
- Validates tokens using core SECRET_KEY
- Role-based permission checking

## Status Transitions

### Shipment Status Workflow
```
SCHEDULED → IN_TRANSIT → DELIVERED
    ↓           ↓
CANCELLED   CANCELLED
```

Valid transitions:
- `SCHEDULED` → `IN_TRANSIT` or `CANCELLED`
- `IN_TRANSIT` → `DELIVERED` or `CANCELLED`
- `DELIVERED` and `CANCELLED` are terminal states

### Automatic Date Tracking
- `IN_TRANSIT`: Sets `actualDepartureDate` to current time
- `DELIVERED`: Sets `actualArrivalDate` to current time

## Architecture

### Repository Pattern
- Separate repository classes for data access
- MongoDB operations isolated from business logic
- Atomic counter sequences for code generation

### Service Layer
- Business logic validation
- Cross-entity validation (e.g., vehicle/route existence)
- Status transition validation
- HTTPException error handling

### API Layer
- FastAPI routes with Pydantic validation
- JWT authentication middleware
- Permission-based access control
- Standardized response formats (SuccessResponse, PaginatedResponse)

## Code Generation

### Vehicle Codes
Format: `V001`, `V002`, `V003`, ...
- Auto-incremented using MongoDB atomic counters
- Unique per vehicle
- 3-digit zero-padded sequence

### Route Codes
Format: `R001`, `R002`, `R003`, ...
- Auto-incremented using MongoDB atomic counters
- Unique per route
- 3-digit zero-padded sequence

### Shipment Codes
Format: `SH001`, `SH002`, `SH003`, ...
- Auto-incremented using MongoDB atomic counters
- Unique per shipment
- 3-digit zero-padded sequence

## Development

### Running the Module
The module is automatically loaded by the A64Core plugin system when:
1. `manifest.json` is present in the module directory
2. `register.py` exports the `register()` function
3. Module is not disabled in configuration

### Testing
Use Playwright MCP for endpoint testing:
```python
# Example: Create a vehicle
POST http://localhost/api/v1/logistics/vehicles
Authorization: Bearer {token}
Content-Type: application/json

{
  "name": "Delivery Truck 1",
  "type": "truck",
  "ownership": "owned",
  "licensePlate": "ABC-1234",
  "capacity": {
    "weight": 5000,
    "volume": 30,
    "unit": "kg/m3"
  },
  "status": "available",
  "costPerKm": 2.5
}
```

### Database Verification
Use MongoDB MCP or mongosh for database verification:
```bash
mongosh --eval "db.vehicles.find()" mongodb://localhost:27017/a64core --quiet
mongosh --eval "db.routes.find()" mongodb://localhost:27017/a64core --quiet
mongosh --eval "db.shipments.find()" mongodb://localhost:27017/a64core --quiet
```

## License

Same as A64 Core Platform

## Author

A64 Core Platform Team
