# Farm Management Module - Data Models

## Data Models

### 1. Farm Model

```python
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from uuid import UUID

class Farm(BaseModel):
    """Farm entity - represents a physical farm location"""
    farmId: UUID = Field(description="Unique farm identifier")
    name: str = Field(description="Farm name", min_length=1, max_length=200)
    description: Optional[str] = Field(None, description="Farm description")
    location: Optional[FarmLocation] = Field(None, description="Geographic location")
    totalArea: Optional[float] = Field(None, description="Total farm area", gt=0)
    areaUnit: Optional[str] = Field("hectares", description="Area unit (hectares, acres)")

    # Metadata
    managerId: UUID = Field(description="User ID of farm manager")
    managerEmail: str = Field(description="Email of farm manager")
    isActive: bool = Field(True, description="Is farm active")

    # Timestamps
    createdAt: datetime
    updatedAt: datetime

    class Config:
        json_schema_extra = {
            "example": {
                "farmId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
                "name": "Green Valley Farm",
                "description": "Organic vegetable farm in central valley",
                "location": {
                    "latitude": 40.7128,
                    "longitude": -74.0060,
                    "address": "123 Farm Road, Valley City"
                },
                "totalArea": 50.5,
                "areaUnit": "hectares",
                "managerId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
                "managerEmail": "manager@example.com",
                "isActive": True
            }
        }

class FarmLocation(BaseModel):
    latitude: Optional[float] = Field(None, ge=-90, le=90)
    longitude: Optional[float] = Field(None, ge=-180, le=180)
    address: Optional[str] = None
```

### 2. Block Model

```python
from enum import Enum
from typing import List, Optional

class BlockState(str, Enum):
    EMPTY = "empty"
    PLANNED = "planned"
    PLANTED = "planted"
    HARVESTING = "harvesting"
    ALERT = "alert"

class Block(BaseModel):
    """Block entity - a designated planting area within a farm"""
    blockId: UUID = Field(description="Unique block identifier")
    farmId: UUID = Field(description="Parent farm ID")

    # Identification
    name: str = Field(description="Block name/number", min_length=1, max_length=100)
    description: Optional[str] = Field(None, description="Block description")

    # Physical properties
    area: Optional[float] = Field(None, description="Block area", gt=0)
    areaUnit: Optional[str] = Field("hectares", description="Area unit")
    maxPlants: int = Field(description="Maximum number of plants", gt=0)

    # State management
    state: BlockState = Field(BlockState.EMPTY, description="Current block state")
    previousState: Optional[BlockState] = Field(None, description="State before alert")

    # Planting information (populated when state = planned/planted/harvesting)
    currentPlanting: Optional[UUID] = Field(None, description="Current planting ID")
    plantedDate: Optional[datetime] = Field(None, description="Date planted")
    estimatedHarvestDate: Optional[datetime] = Field(None, description="Estimated harvest start date")

    # Alert information (populated when state = alert)
    alertId: Optional[UUID] = Field(None, description="Current alert ID")
    alertDescription: Optional[str] = Field(None, description="Alert description")
    alertTriggeredAt: Optional[datetime] = Field(None, description="When alert was triggered")

    # Metadata
    isActive: bool = Field(True, description="Is block active")
    createdAt: datetime
    updatedAt: datetime

    class Config:
        json_schema_extra = {
            "example": {
                "blockId": "b1234567-89ab-cdef-0123-456789abcdef",
                "farmId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
                "name": "Block A-1",
                "description": "North field, full sun",
                "area": 0.5,
                "areaUnit": "hectares",
                "maxPlants": 500,
                "state": "planted",
                "currentPlanting": "p1234567-89ab-cdef-0123-456789abcdef",
                "plantedDate": "2025-01-15T08:00:00Z",
                "estimatedHarvestDate": "2025-04-15T00:00:00Z",
                "isActive": True
            }
        }
```

### 3. Plant Data Model

```python
from typing import Optional, List

class PlantData(BaseModel):
    """Plant data - cultivation requirements and characteristics"""
    plantDataId: UUID = Field(description="Unique plant data identifier")

    # Identification
    plantName: str = Field(description="Common plant name", min_length=1, max_length=200)
    scientificName: Optional[str] = Field(None, description="Scientific name")
    plantType: str = Field(description="Plant type (Crop, Tree, Herb, etc.)")

    # Growth cycle
    growthCycleDays: int = Field(description="Days from planting to harvest", gt=0)

    # Environmental requirements
    minTemperatureCelsius: Optional[float] = Field(None, description="Minimum temperature")
    maxTemperatureCelsius: Optional[float] = Field(None, description="Maximum temperature")
    optimalPHMin: Optional[float] = Field(None, description="Optimal soil pH minimum", ge=0, le=14)
    optimalPHMax: Optional[float] = Field(None, description="Optimal soil pH maximum", ge=0, le=14)

    # Care requirements
    wateringFrequencyDays: Optional[int] = Field(None, description="Days between watering", gt=0)
    sunlightHoursDaily: Optional[str] = Field(None, description="Daily sunlight hours (e.g. '6-8')")
    fertilizationScheduleDays: Optional[int] = Field(None, description="Days between fertilization", gt=0)
    pesticideScheduleDays: Optional[int] = Field(None, description="Days between pesticide application", gt=0)

    # Yield information
    expectedYieldPerPlant: float = Field(description="Expected yield per plant", gt=0)
    yieldUnit: str = Field(description="Unit of yield (kg, lbs, units)")

    # Additional information
    notes: Optional[str] = Field(None, description="Additional cultivation notes")
    tags: Optional[List[str]] = Field(None, description="Search tags")

    # Versioning (for frozen data on planting)
    dataVersion: int = Field(1, description="Data version number")

    # Metadata
    createdBy: UUID = Field(description="User ID who created this data")
    createdByEmail: str = Field(description="Email of creator")
    createdAt: datetime
    updatedAt: datetime

    class Config:
        json_schema_extra = {
            "example": {
                "plantDataId": "d1234567-89ab-cdef-0123-456789abcdef",
                "plantName": "Tomato",
                "scientificName": "Solanum lycopersicum",
                "plantType": "Crop",
                "growthCycleDays": 90,
                "minTemperatureCelsius": 15.0,
                "maxTemperatureCelsius": 30.0,
                "optimalPHMin": 6.0,
                "optimalPHMax": 6.8,
                "wateringFrequencyDays": 3,
                "sunlightHoursDaily": "6-8",
                "fertilizationScheduleDays": 14,
                "pesticideScheduleDays": 21,
                "expectedYieldPerPlant": 5.0,
                "yieldUnit": "kg",
                "notes": "Requires staking, prune suckers",
                "tags": ["vegetable", "fruit", "summer"],
                "dataVersion": 1,
                "createdBy": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
                "createdByEmail": "agronomist@example.com"
            }
        }
```

### 4. Planting Model

```python
from typing import List, Dict

class PlantingItem(BaseModel):
    """Individual plant type within a planting"""
    plantDataId: UUID = Field(description="Reference to plant data")
    plantName: str = Field(description="Plant name (cached)")
    quantity: int = Field(description="Number of plants", gt=0)

    # Frozen plant data at time of planting (for yield calculation)
    plantDataSnapshot: Dict = Field(description="Snapshot of plant data at planting time")

class Planting(BaseModel):
    """Planting record - what was planted in a block"""
    plantingId: UUID = Field(description="Unique planting identifier")
    blockId: UUID = Field(description="Block where planted")
    farmId: UUID = Field(description="Farm ID (for queries)")

    # Planting details
    plants: List[PlantingItem] = Field(description="Plants in this planting")
    totalPlants: int = Field(description="Total number of plants", gt=0)

    # Planning information
    plannedBy: UUID = Field(description="User ID who planned")
    plannedByEmail: str = Field(description="Email of planner")
    plannedAt: datetime = Field(description="When planning was created")

    # Planting information (populated when farmer marks planted)
    plantedBy: Optional[UUID] = Field(None, description="User ID who planted")
    plantedByEmail: Optional[str] = Field(None, description="Email of planter")
    plantedAt: Optional[datetime] = Field(None, description="When planting occurred")

    # Harvest window (calculated from plant data)
    estimatedHarvestStartDate: Optional[datetime] = Field(None, description="Estimated harvest start")
    estimatedHarvestEndDate: Optional[datetime] = Field(None, description="Estimated harvest end")

    # Yield prediction
    predictedYield: float = Field(description="Predicted total yield")
    yieldUnit: str = Field(description="Unit of yield")

    # Status
    status: str = Field("planned", description="Status: planned, planted, harvesting, completed")

    # Timestamps
    createdAt: datetime
    updatedAt: datetime

    class Config:
        json_schema_extra = {
            "example": {
                "plantingId": "p1234567-89ab-cdef-0123-456789abcdef",
                "blockId": "b1234567-89ab-cdef-0123-456789abcdef",
                "farmId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
                "plants": [
                    {
                        "plantDataId": "d1234567-89ab-cdef-0123-456789abcdef",
                        "plantName": "Tomato",
                        "quantity": 50,
                        "plantDataSnapshot": {"expectedYieldPerPlant": 5.0, "yieldUnit": "kg"}
                    },
                    {
                        "plantDataId": "d2234567-89ab-cdef-0123-456789abcdef",
                        "plantName": "Basil",
                        "quantity": 30,
                        "plantDataSnapshot": {"expectedYieldPerPlant": 0.5, "yieldUnit": "kg"}
                    }
                ],
                "totalPlants": 80,
                "predictedYield": 265.0,
                "yieldUnit": "kg",
                "status": "planted",
                "plannedBy": "manager-uuid",
                "plannedByEmail": "manager@example.com",
                "plantedBy": "farmer-uuid",
                "plantedByEmail": "farmer@example.com",
                "plantedAt": "2025-01-15T08:00:00Z"
            }
        }
```

### 5. Harvest Model

```python
class HarvestEntry(BaseModel):
    """Individual harvest record"""
    plantDataId: UUID = Field(description="Plant type harvested")
    plantName: str = Field(description="Plant name")
    quantityHarvested: float = Field(description="Quantity harvested", ge=0)
    qualityGrade: Optional[str] = Field(None, description="Quality grade (A, B, C)")
    notes: Optional[str] = Field(None, description="Harvest notes")

class Harvest(BaseModel):
    """Harvest record - what was harvested from a block"""
    harvestId: UUID = Field(description="Unique harvest identifier")
    plantingId: UUID = Field(description="Reference to planting")
    blockId: UUID = Field(description="Block harvested")
    farmId: UUID = Field(description="Farm ID")

    # Harvest details
    entries: List[HarvestEntry] = Field(description="Harvest entries by plant type")
    totalQuantity: float = Field(description="Total quantity harvested", ge=0)
    yieldUnit: str = Field(description="Unit of yield")

    # Comparison with prediction
    predictedYield: float = Field(description="Originally predicted yield")
    yieldEfficiency: float = Field(description="Actual/Predicted ratio (percentage)")

    # Harvest information
    harvestedBy: UUID = Field(description="User ID who recorded harvest")
    harvestedByEmail: str = Field(description="Email of harvester")
    harvestStartDate: datetime = Field(description="When harvesting started")
    harvestEndDate: datetime = Field(description="When harvesting ended")

    # Additional information
    notes: Optional[str] = Field(None, description="General harvest notes")

    # Timestamps
    createdAt: datetime
    updatedAt: datetime

    class Config:
        json_schema_extra = {
            "example": {
                "harvestId": "h1234567-89ab-cdef-0123-456789abcdef",
                "plantingId": "p1234567-89ab-cdef-0123-456789abcdef",
                "blockId": "b1234567-89ab-cdef-0123-456789abcdef",
                "farmId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
                "entries": [
                    {
                        "plantDataId": "d1234567-89ab-cdef-0123-456789abcdef",
                        "plantName": "Tomato",
                        "quantityHarvested": 240.0,
                        "qualityGrade": "A",
                        "notes": "Excellent quality"
                    },
                    {
                        "plantDataId": "d2234567-89ab-cdef-0123-456789abcdef",
                        "plantName": "Basil",
                        "quantityHarvested": 14.0,
                        "qualityGrade": "A",
                        "notes": "Aromatic"
                    }
                ],
                "totalQuantity": 254.0,
                "yieldUnit": "kg",
                "predictedYield": 265.0,
                "yieldEfficiency": 95.8,
                "harvestedBy": "farmer-uuid",
                "harvestedByEmail": "farmer@example.com",
                "harvestStartDate": "2025-04-15T06:00:00Z",
                "harvestEndDate": "2025-04-20T18:00:00Z"
            }
        }
```

### 6. Daily Harvest Model (NEW)

```python
class DailyHarvestEntry(BaseModel):
    """Single day's harvest entry for one plant type"""
    plantDataId: UUID = Field(description="Plant type harvested")
    plantName: str = Field(description="Plant name")
    quantityHarvested: float = Field(description="Quantity harvested today", ge=0)
    qualityGrade: Optional[str] = Field(None, description="Quality grade (A, B, C, D)")
    notes: Optional[str] = Field(None, description="Notes for this harvest")

class DailyHarvest(BaseModel):
    """Daily harvest record - harvests are recorded incrementally each day"""
    dailyHarvestId: UUID = Field(description="Unique daily harvest identifier")
    cycleId: UUID = Field(description="Reference to block cycle")
    plantingId: UUID = Field(description="Reference to planting")
    blockId: UUID = Field(description="Block harvested")
    farmId: UUID = Field(description="Farm ID")

    # Harvest date
    harvestDate: datetime = Field(description="Date of this harvest")

    # Harvest details
    entries: List[DailyHarvestEntry] = Field(description="Harvest entries by plant type")
    totalQuantity: float = Field(description="Total quantity harvested today", ge=0)
    yieldUnit: str = Field(description="Unit of yield")

    # Harvest information
    harvestedBy: UUID = Field(description="User ID who recorded harvest")
    harvestedByEmail: str = Field(description="Email of harvester")

    # Additional information
    weatherConditions: Optional[str] = Field(None, description="Weather during harvest")
    notes: Optional[str] = Field(None, description="General notes")

    # Timestamps
    createdAt: datetime
    updatedAt: datetime

    class Config:
        json_schema_extra = {
            "example": {
                "dailyHarvestId": "dh1234567-89ab-cdef-0123-456789abcdef",
                "cycleId": "c1234567-89ab-cdef-0123-456789abcdef",
                "plantingId": "p1234567-89ab-cdef-0123-456789abcdef",
                "blockId": "b1234567-89ab-cdef-0123-456789abcdef",
                "farmId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
                "harvestDate": "2025-04-15T08:00:00Z",
                "entries": [
                    {
                        "plantDataId": "d1234567-89ab-cdef-0123-456789abcdef",
                        "plantName": "Tomato",
                        "quantityHarvested": 45.0,
                        "qualityGrade": "A",
                        "notes": "First day harvest, excellent condition"
                    }
                ],
                "totalQuantity": 45.0,
                "yieldUnit": "kg",
                "harvestedBy": "farmer-uuid",
                "harvestedByEmail": "farmer@example.com",
                "weatherConditions": "Sunny, 25°C",
                "notes": "Good harvest day"
            }
        }
```

### 7. Alert Model (UPDATED)

```python
from enum import Enum

class AlertSeverity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

class AlertStatus(str, Enum):
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    RESOLVED = "resolved"

class Alert(BaseModel):
    """Alert record - issues reported by farmers"""
    alertId: UUID = Field(description="Unique alert identifier")
    cycleId: Optional[UUID] = Field(None, description="Reference to block cycle (if during cycle)")
    blockId: UUID = Field(description="Block with issue")
    farmId: UUID = Field(description="Farm ID")

    # Alert details
    title: str = Field(description="Alert title", min_length=1, max_length=200)
    description: str = Field(description="Detailed description of issue")
    severity: AlertSeverity = Field(description="Alert severity level")
    status: AlertStatus = Field(AlertStatus.OPEN, description="Alert status")

    # Alert tracking
    triggeredBy: UUID = Field(description="User ID who triggered alert")
    triggeredByEmail: str = Field(description="Email of trigger user")
    triggeredAt: datetime = Field(description="When alert was triggered")

    # Assignment and resolution
    assignedTo: Optional[UUID] = Field(None, description="User assigned to resolve")
    assignedToEmail: Optional[str] = Field(None, description="Email of assigned user")

    resolvedBy: Optional[UUID] = Field(None, description="User who resolved alert")
    resolvedByEmail: Optional[str] = Field(None, description="Email of resolver")
    resolvedAt: Optional[datetime] = Field(None, description="When alert was resolved")
    resolutionNotes: Optional[str] = Field(None, description="Resolution notes")

    # Notification tracking
    notificationsSent: List[str] = Field(default_factory=list, description="Channels used (email, sms, in-app)")
    escalated: bool = Field(False, description="Has alert been escalated")
    escalatedAt: Optional[datetime] = Field(None, description="When escalated")

    # Timestamps
    createdAt: datetime
    updatedAt: datetime

    class Config:
        json_schema_extra = {
            "example": {
                "alertId": "al1234567-89ab-cdef-0123-456789abcdef",
                "cycleId": "c1234567-89ab-cdef-0123-456789abcdef",
                "blockId": "b1234567-89ab-cdef-0123-456789abcdef",
                "farmId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
                "title": "Aphid infestation detected",
                "description": "Significant aphid presence on tomato plants in north section",
                "severity": "high",
                "status": "open",
                "triggeredBy": "farmer-uuid",
                "triggeredByEmail": "farmer@example.com",
                "triggeredAt": "2025-02-10T10:30:00Z",
                "assignedTo": "manager-uuid",
                "assignedToEmail": "manager@example.com",
                "notificationsSent": ["in-app", "email"],
                "escalated": False
            }
        }
```

### 8. Block Cycle Model (NEW - CRITICAL)

```python
class BlockCycleAlert(BaseModel):
    """Alert summary for cycle history"""
    alertId: UUID
    title: str
    severity: AlertSeverity
    triggeredAt: datetime
    resolvedAt: Optional[datetime]
    resolutionNotes: Optional[str]

class BlockCycleDailyHarvest(BaseModel):
    """Daily harvest summary for cycle history"""
    date: datetime
    totalQuantity: float
    entries: List[Dict]  # Simplified plant-wise breakdown

class BlockCycle(BaseModel):
    """Complete cycle history for a block - one planting-to-harvest sequence"""
    cycleId: UUID = Field(description="Unique cycle identifier")
    blockId: UUID = Field(description="Block ID")
    farmId: UUID = Field(description="Farm ID")
    cycleNumber: int = Field(description="Cycle number for this block (1, 2, 3, ...)", gt=0)

    # Planting information (frozen snapshot)
    plantingId: UUID = Field(description="Reference to planting")
    plants: List[PlantingItem] = Field(description="What was planted (frozen)")
    totalPlants: int = Field(description="Total number of plants")

    # Planning
    plannedBy: UUID
    plannedByEmail: str
    plannedAt: datetime

    # Execution
    plantedBy: UUID
    plantedByEmail: str
    plantedAt: datetime

    # Timeline
    estimatedHarvestStartDate: datetime = Field(description="When harvest was expected to start")
    actualHarvestStartDate: Optional[datetime] = Field(None, description="When harvest actually started")
    actualHarvestEndDate: Optional[datetime] = Field(None, description="When harvest ended")
    cycleDurationDays: Optional[int] = Field(None, description="Total days from planting to final harvest")

    # Harvest performance
    predictedYield: float = Field(description="Predicted total yield")
    actualYield: float = Field(description="Actual total yield")
    yieldUnit: str
    yieldEfficiency: float = Field(description="Actual/Predicted ratio (percentage)")

    dailyHarvests: List[BlockCycleDailyHarvest] = Field(default_factory=list, description="Day-by-day harvest records")
    totalHarvestDays: int = Field(description="Number of days harvesting occurred")

    # Alerts during cycle
    alerts: List[BlockCycleAlert] = Field(default_factory=list, description="All alerts during this cycle")
    totalAlerts: int = Field(0, description="Number of alerts")
    criticalAlerts: int = Field(0, description="Number of critical alerts")

    # Performance metrics
    harvestDelayDays: int = Field(0, description="Days delayed past estimated start (0 = on time, negative = early)")
    qualityIssues: int = Field(0, description="Number of quality-related alerts")

    # Environmental data (future)
    avgTemperature: Optional[float] = Field(None, description="Average temperature during cycle")
    totalRainfall: Optional[float] = Field(None, description="Total rainfall during cycle")

    # Cycle status
    status: str = Field("active", description="Status: active, completed")
    completedBy: Optional[UUID] = Field(None, description="Manager who completed cycle")
    completedByEmail: Optional[str] = Field(None, description="Email of completer")

    # Timestamps
    createdAt: datetime
    updatedAt: datetime
    completedAt: Optional[datetime] = Field(None, description="When cycle was completed")

    class Config:
        json_schema_extra = {
            "example": {
                "cycleId": "c1234567-89ab-cdef-0123-456789abcdef",
                "blockId": "b1234567-89ab-cdef-0123-456789abcdef",
                "farmId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
                "cycleNumber": 3,
                "plantingId": "p1234567-89ab-cdef-0123-456789abcdef",
                "plants": [
                    {"plantDataId": "d123...", "plantName": "Tomato", "quantity": 50}
                ],
                "totalPlants": 50,
                "plantedAt": "2025-01-15T08:00:00Z",
                "estimatedHarvestStartDate": "2025-04-15T00:00:00Z",
                "actualHarvestStartDate": "2025-04-17T00:00:00Z",
                "actualHarvestEndDate": "2025-04-22T00:00:00Z",
                "cycleDurationDays": 97,
                "predictedYield": 250.0,
                "actualYield": 240.0,
                "yieldUnit": "kg",
                "yieldEfficiency": 96.0,
                "totalHarvestDays": 5,
                "harvestDelayDays": 2,
                "totalAlerts": 1,
                "criticalAlerts": 0,
                "status": "completed"
            }
        }
```

### 9. Stock Inventory Model (NEW)

```python
class StockInventoryItem(BaseModel):
    """Farm stock inventory - aggregated harvest data for other modules"""
    inventoryId: UUID = Field(description="Unique inventory item identifier")
    farmId: UUID = Field(description="Farm ID")

    # Product information
    plantDataId: UUID = Field(description="Plant type")
    plantName: str = Field(description="Plant/product name")
    productType: str = Field(description="Product type (fresh, processed, etc.)")

    # Quantity tracking
    totalQuantity: float = Field(description="Current stock quantity", ge=0)
    reservedQuantity: float = Field(0.0, description="Quantity reserved for orders", ge=0)
    availableQuantity: float = Field(description="Available for sale/use", ge=0)
    unit: str = Field(description="Unit of measurement")

    # Quality tracking
    qualityGrade: str = Field(description="Overall quality grade")
    harvestDate: datetime = Field(description="Harvest date (FIFO tracking)")
    expiryDate: Optional[datetime] = Field(None, description="Expected expiry date")

    # Source tracking
    blockId: UUID = Field(description="Block where harvested")
    cycleId: UUID = Field(description="Cycle reference")
    dailyHarvestId: UUID = Field(description="Daily harvest reference")

    # Integration with other modules
    usedByModules: List[str] = Field(default_factory=list, description="Modules using this inventory")

    # Timestamps
    createdAt: datetime
    updatedAt: datetime
    lastMovementAt: Optional[datetime] = Field(None, description="Last stock movement")

    class Config:
        json_schema_extra = {
            "example": {
                "inventoryId": "inv1234567-89ab-cdef-0123-456789abcdef",
                "farmId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
                "plantDataId": "d1234567-89ab-cdef-0123-456789abcdef",
                "plantName": "Tomato",
                "productType": "fresh",
                "totalQuantity": 45.0,
                "reservedQuantity": 10.0,
                "availableQuantity": 35.0,
                "unit": "kg",
                "qualityGrade": "A",
                "harvestDate": "2025-04-15T08:00:00Z",
                "expiryDate": "2025-04-22T00:00:00Z",
                "blockId": "b1234567-89ab-cdef-0123-456789abcdef",
                "cycleId": "c1234567-89ab-cdef-0123-456789abcdef",
                "dailyHarvestId": "dh1234567-89ab-cdef-0123-456789abcdef",
                "usedByModules": ["sales", "logistics"]
            }
        }
```

### 10. Farm Assignment Model

```python
class FarmAssignment(BaseModel):
    """User assignment to farms - controls access"""
    assignmentId: UUID = Field(description="Unique assignment identifier")
    userId: UUID = Field(description="User ID")
    userEmail: str = Field(description="User email")
    farmId: UUID = Field(description="Farm ID")

    # Assignment details
    assignedBy: UUID = Field(description="User who made assignment")
    assignedByEmail: str = Field(description="Email of assigner")
    role: str = Field(description="Role on this farm (manager, farmer)")

    # Status
    isActive: bool = Field(True, description="Is assignment active")

    # Timestamps
    createdAt: datetime
    updatedAt: datetime

    class Config:
        json_schema_extra = {
            "example": {
                "assignmentId": "a1234567-89ab-cdef-0123-456789abcdef",
                "userId": "u1234567-89ab-cdef-0123-456789abcdef",
                "userEmail": "farmer@example.com",
                "farmId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
                "assignedBy": "manager-uuid",
                "assignedByEmail": "manager@example.com",
                "role": "farmer",
                "isActive": True
            }
        }
```

---



---

**[← Back to Index](./README.md)**
