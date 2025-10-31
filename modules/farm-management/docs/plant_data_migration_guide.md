# Plant Data Migration Guide

## Overview

This guide provides a comprehensive strategy for migrating from the basic `plant_data.py` schema to the enhanced `plant_data_enhanced.py` schema while maintaining backward compatibility and zero downtime.

---

## Migration Strategy Options

### Option 1: Parallel Schema (RECOMMENDED)
Run both schemas simultaneously during transition period.

**Pros:**
- Zero downtime
- Gradual migration
- Easy rollback
- Test thoroughly before full cutover

**Cons:**
- Temporary code duplication
- Requires maintaining both schemas

### Option 2: Big Bang Migration
Convert all data at once during maintenance window.

**Pros:**
- Clean cutover
- No dual-schema complexity

**Cons:**
- Requires downtime
- Higher risk
- Difficult to rollback

### Option 3: Shadow Mode
Write to both schemas, read from old schema, gradually migrate.

**Pros:**
- Data safety (dual writes)
- Validate new schema with production data
- Easy rollback

**Cons:**
- Complex implementation
- Temporary performance overhead

---

## Recommended Migration Path: Parallel Schema with Gradual Cutover

### Phase 1: Preparation (Week 1)

#### 1.1 Deploy New Schema Alongside Old Schema
```python
# Keep existing: src/models/plant_data.py
# Add new: src/models/plant_data_enhanced.py
# Add mapper: src/models/plant_data_mapper.py
```

#### 1.2 Create Data Mapper Utility
```python
# src/models/plant_data_mapper.py

from typing import Optional
from .plant_data import PlantData as PlantDataLegacy
from .plant_data_enhanced import (
    PlantDataEnhanced,
    PlantDataEnhancedCreate,
    GrowthCycleDuration,
    YieldInfo,
    EnvironmentalRequirements,
    TemperatureRange,
    WateringRequirements,
    SoilRequirements,
    PHRequirements,
    LightRequirements,
    EconomicsAndLabor,
    AdditionalInformation,
    SpacingRequirements,
    FarmTypeEnum,
    WaterTypeEnum,
    ToleranceLevelEnum,
    LightTypeEnum,
    SoilTypeEnum,
    GrowthHabitEnum,
    SupportTypeEnum
)


class PlantDataMigrationMapper:
    """
    Bidirectional mapper between legacy and enhanced plant data models
    """

    @staticmethod
    def legacy_to_enhanced(legacy: PlantDataLegacy) -> PlantDataEnhancedCreate:
        """
        Convert legacy plant data to enhanced format with sensible defaults

        Note: Many fields in enhanced schema don't exist in legacy.
        Use conservative defaults and flag for manual review.
        """

        # Parse sunlight hours (e.g., "6-8" -> min=6, max=8)
        min_hours, max_hours, optimal_hours = 8.0, 8.0, 8.0
        if legacy.sunlightHoursDaily:
            parts = legacy.sunlightHoursDaily.split('-')
            if len(parts) == 2:
                min_hours = float(parts[0])
                max_hours = float(parts[1])
                optimal_hours = (min_hours + max_hours) / 2

        # Infer farm type from plantType
        farm_types = []
        if legacy.plantType.lower() in ['crop', 'vegetable']:
            farm_types = [FarmTypeEnum.OPEN_FIELD, FarmTypeEnum.GREENHOUSE]
        else:
            farm_types = [FarmTypeEnum.OPEN_FIELD]

        return PlantDataEnhancedCreate(
            plantName=legacy.plantName,
            scientificName=legacy.scientificName or "Unknown species",
            farmTypeCompatibility=farm_types,

            # Growth cycle - distribute total days proportionally
            growthCycle=GrowthCycleDuration(
                germinationDays=int(legacy.growthCycleDays * 0.1),  # ~10%
                vegetativeDays=int(legacy.growthCycleDays * 0.4),   # ~40%
                floweringDays=int(legacy.growthCycleDays * 0.2),    # ~20%
                fruitingDays=int(legacy.growthCycleDays * 0.2),     # ~20%
                harvestDurationDays=int(legacy.growthCycleDays * 0.1),  # ~10%
                totalCycleDays=legacy.growthCycleDays
            ),

            # Yield info
            yieldInfo=YieldInfo(
                yieldPerPlant=legacy.expectedYieldPerPlant,
                yieldUnit=legacy.yieldUnit,
                expectedWastePercentage=10.0  # Default estimate
            ),

            # Fertilizer schedule - create basic entry if available
            fertilizerSchedule=[],  # Empty - requires manual data entry

            # Pesticide schedule - create basic entry if available
            pesticideSchedule=[],  # Empty - requires manual data entry

            # Environmental requirements
            environmentalRequirements=EnvironmentalRequirements(
                temperature=TemperatureRange(
                    minCelsius=legacy.minTemperatureCelsius or 15.0,
                    maxCelsius=legacy.maxTemperatureCelsius or 30.0,
                    optimalCelsius=(
                        (legacy.minTemperatureCelsius or 15.0) +
                        (legacy.maxTemperatureCelsius or 30.0)
                    ) / 2
                ),
                humidity=None,  # Not available in legacy
                co2RequirementPpm=None,
                airCirculation=None
            ),

            # Watering requirements
            wateringRequirements=WateringRequirements(
                frequencyDays=legacy.wateringFrequencyDays or 3,
                waterType=WaterTypeEnum.TAP,  # Default
                amountPerPlantLiters=None,
                droughtTolerance=ToleranceLevelEnum.MEDIUM,
                notes=None
            ),

            # Soil requirements
            soilRequirements=SoilRequirements(
                phRequirements=PHRequirements(
                    minPH=legacy.optimalPHMin or 6.0,
                    maxPH=legacy.optimalPHMax or 7.0,
                    optimalPH=(
                        (legacy.optimalPHMin or 6.0) +
                        (legacy.optimalPHMax or 7.0)
                    ) / 2
                ),
                soilTypes=[SoilTypeEnum.LOAMY],  # Default
                nutrientsRecommendations=None,
                ecRangeMs=None,
                tdsRangePpm=None,
                notes=None
            ),

            # Diseases and pests
            diseasesAndPests=[],  # Empty - requires manual data entry

            # Light requirements
            lightRequirements=LightRequirements(
                lightType=LightTypeEnum.FULL_SUN,  # Default
                minHoursDaily=min_hours,
                maxHoursDaily=max_hours,
                optimalHoursDaily=optimal_hours,
                intensityLux=None,
                intensityPpfd=None,
                photoperiodSensitive=False,
                notes=legacy.sunlightHoursDaily
            ),

            # Grading standards
            gradingStandards=[],  # Empty - requires manual data entry

            # Economics and labor
            economicsAndLabor=EconomicsAndLabor(
                averageMarketValuePerKg=None,  # Not available
                currency="USD",
                totalManHoursPerPlant=1.0,  # Default estimate
                plantingHours=None,
                maintenanceHours=None,
                harvestingHours=None,
                notes=None
            ),

            # Additional information
            additionalInfo=AdditionalInformation(
                growthHabit=GrowthHabitEnum.BUSH,  # Default
                spacing=SpacingRequirements(
                    betweenPlantsCm=50.0,  # Default estimate
                    betweenRowsCm=75.0,    # Default estimate
                    plantsPerSquareMeter=2.67
                ),
                supportRequirements=SupportTypeEnum.NONE,
                companionPlants=None,
                incompatiblePlants=None,
                notes=legacy.notes
            ),

            # Tags
            tags=legacy.tags or []
        )

    @staticmethod
    def enhanced_to_legacy(enhanced: PlantDataEnhanced) -> PlantDataLegacy:
        """
        Convert enhanced plant data back to legacy format
        Uses PlantDataLegacy.from_enhanced() method
        """
        return PlantDataLegacy.from_enhanced(enhanced)


async def migrate_single_plant(
    legacy_data: PlantDataLegacy,
    db_collection_enhanced
) -> PlantDataEnhanced:
    """
    Migrate a single plant record from legacy to enhanced schema

    Returns the newly created enhanced record
    """
    # Convert to enhanced format
    enhanced_create = PlantDataMigrationMapper.legacy_to_enhanced(legacy_data)

    # Create full enhanced model with metadata
    enhanced_data = PlantDataEnhanced(
        **enhanced_create.model_dump(),
        plantDataId=legacy_data.plantDataId,  # Preserve ID
        dataVersion=legacy_data.dataVersion,
        createdBy=legacy_data.createdBy,
        createdByEmail=legacy_data.createdByEmail,
        createdAt=legacy_data.createdAt,
        updatedAt=legacy_data.updatedAt
    )

    # Insert into enhanced collection
    await db_collection_enhanced.insert_one(
        enhanced_data.model_dump(mode='json')
    )

    return enhanced_data
```

### Phase 2: Dual-Write Implementation (Week 2)

#### 2.1 Modify Create/Update Endpoints
```python
# Pseudocode for dual-write pattern

async def create_plant_data(plant_data: PlantDataCreate):
    """Write to both legacy and enhanced collections"""

    # Write to legacy collection (existing code)
    legacy_record = await legacy_collection.insert_one(plant_data.dict())

    # Convert and write to enhanced collection
    enhanced_data = convert_to_enhanced(plant_data)
    await enhanced_collection.insert_one(enhanced_data.dict())

    # Return legacy format for now (backward compatibility)
    return legacy_record
```

#### 2.2 Add Feature Flag
```python
# src/config.py

class FeatureFlags:
    USE_ENHANCED_PLANT_DATA: bool = os.getenv("USE_ENHANCED_PLANT_DATA", "false").lower() == "true"
    DUAL_WRITE_PLANT_DATA: bool = os.getenv("DUAL_WRITE_PLANT_DATA", "true").lower() == "true"
```

### Phase 3: Bulk Data Migration (Week 3)

#### 3.1 Migration Script
```python
# scripts/migrate_plant_data.py

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from src.models.plant_data import PlantData as PlantDataLegacy
from src.models.plant_data_mapper import migrate_single_plant
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def migrate_all_plants():
    """
    Migrate all existing plant records from legacy to enhanced schema
    """
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client.farm_management_db

    legacy_collection = db.plant_data
    enhanced_collection = db.plant_data_enhanced

    # Get count
    total_count = await legacy_collection.count_documents({})
    logger.info(f"Found {total_count} plant records to migrate")

    migrated_count = 0
    error_count = 0

    # Batch process
    async for legacy_doc in legacy_collection.find({}):
        try:
            # Parse legacy document
            legacy_data = PlantDataLegacy(**legacy_doc)

            # Check if already migrated
            exists = await enhanced_collection.find_one({
                "plantDataId": str(legacy_data.plantDataId)
            })

            if exists:
                logger.info(f"Skipping {legacy_data.plantName} - already migrated")
                continue

            # Migrate
            await migrate_single_plant(legacy_data, enhanced_collection)
            migrated_count += 1

            if migrated_count % 10 == 0:
                logger.info(f"Progress: {migrated_count}/{total_count}")

        except Exception as e:
            logger.error(f"Error migrating {legacy_doc.get('plantName')}: {e}")
            error_count += 1
            continue

    logger.info(f"Migration complete: {migrated_count} migrated, {error_count} errors")


if __name__ == "__main__":
    asyncio.run(migrate_all_plants())
```

#### 3.2 Run Migration
```bash
# Dry run first (add --dry-run flag to script)
python scripts/migrate_plant_data.py --dry-run

# Actual migration
python scripts/migrate_plant_data.py

# Verify
python scripts/verify_migration.py
```

### Phase 4: Testing and Validation (Week 4)

#### 4.1 Data Validation Script
```python
# scripts/verify_migration.py

async def verify_migration():
    """
    Verify that all legacy records were migrated correctly
    """
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client.farm_management_db

    legacy_count = await db.plant_data.count_documents({})
    enhanced_count = await db.plant_data_enhanced.count_documents({})

    print(f"Legacy records: {legacy_count}")
    print(f"Enhanced records: {enhanced_count}")

    if legacy_count == enhanced_count:
        print("✅ Record counts match")
    else:
        print(f"❌ Count mismatch: {legacy_count - enhanced_count} records missing")

    # Spot check 10 random records
    sample_records = await db.plant_data.aggregate([
        { "$sample": { "size": 10 } }
    ]).to_list(length=10)

    for legacy_doc in sample_records:
        plant_id = legacy_doc.get("plantDataId")
        enhanced_doc = await db.plant_data_enhanced.find_one({
            "plantDataId": plant_id
        })

        if not enhanced_doc:
            print(f"❌ Missing: {legacy_doc.get('plantName')} ({plant_id})")
        else:
            print(f"✅ Found: {legacy_doc.get('plantName')}")
```

#### 4.2 Test Queries on Both Schemas
```python
# Ensure all queries work on both collections

# Test 1: Get by ID
legacy_plant = await db.plant_data.find_one({"plantDataId": test_id})
enhanced_plant = await db.plant_data_enhanced.find_one({"plantDataId": test_id})

# Test 2: Search by name
legacy_results = await db.plant_data.find({"plantName": "Tomato"}).to_list(10)
enhanced_results = await db.plant_data_enhanced.find({"plantName": "Tomato"}).to_list(10)

# Test 3: Filter by tags
# ... etc
```

### Phase 5: Gradual Cutover (Week 5-6)

#### 5.1 Enable Read from Enhanced Schema for New Features
```python
# src/api/v1/plant_data.py

from src.config import FeatureFlags

@router.get("/plant-data/{plant_id}")
async def get_plant_data(plant_id: UUID):
    if FeatureFlags.USE_ENHANCED_PLANT_DATA:
        # Read from enhanced collection
        return await get_from_enhanced_collection(plant_id)
    else:
        # Read from legacy collection
        return await get_from_legacy_collection(plant_id)
```

#### 5.2 Monitor Performance and Errors
```python
# Add monitoring/logging for cutover period
import time

start_time = time.time()
result = await fetch_plant_data(plant_id)
duration = time.time() - start_time

logger.info(f"Plant data fetch: {duration:.3f}s (schema={'enhanced' if USE_ENHANCED else 'legacy'})")
```

#### 5.3 Gradually Increase Traffic to Enhanced Schema
```bash
# Week 5: 10% traffic
export USE_ENHANCED_PLANT_DATA=true  # for 10% of instances

# Week 6: 50% traffic
# ... increase gradually

# Week 7: 100% traffic
# All instances use enhanced schema
```

### Phase 6: Legacy Schema Deprecation (Week 8+)

#### 6.1 Stop Dual Writes
```python
# Remove dual-write code
# Only write to enhanced collection
```

#### 6.2 Mark Legacy Collection as Read-Only
```javascript
// MongoDB: Add validation to prevent writes
db.runCommand({
  collMod: "plant_data",
  validator: { $jsonSchema: { bsonType: "null" } },  // Reject all writes
  validationLevel: "strict"
})
```

#### 6.3 Archive Legacy Collection (After 30 Days)
```javascript
// Rename for archival
db.plant_data.renameCollection("plant_data_legacy_archive_20251130")

// Or export and delete
mongoexport --collection=plant_data --out=plant_data_legacy_backup.json
db.plant_data.drop()
```

---

## Backward Compatibility Considerations

### API Response Format
Maintain backward compatibility in API responses:

```python
@router.get("/plant-data/{plant_id}")
async def get_plant_data(
    plant_id: UUID,
    response_format: str = "legacy"  # or "enhanced"
):
    """Support both response formats during transition"""

    enhanced_data = await db.plant_data_enhanced.find_one({"plantDataId": plant_id})

    if response_format == "legacy":
        # Convert to legacy format
        return PlantDataLegacy.from_enhanced(enhanced_data)
    else:
        return enhanced_data
```

### Database Collection Naming
```
Legacy:   plant_data
Enhanced: plant_data_enhanced  (during migration)
Final:    plant_data  (after legacy removal)
```

---

## Rollback Plan

If issues arise during migration:

### Immediate Rollback (Same Day)
```python
# 1. Disable enhanced schema feature flag
export USE_ENHANCED_PLANT_DATA=false

# 2. Stop dual writes to enhanced collection
export DUAL_WRITE_PLANT_DATA=false

# 3. Restart services
# All traffic reverts to legacy schema
```

### Data Rollback (If Enhanced Collection Corrupted)
```javascript
// Drop enhanced collection
db.plant_data_enhanced.drop()

// Re-run migration when issue resolved
python scripts/migrate_plant_data.py
```

---

## Migration Checklist

### Pre-Migration
- [ ] Deploy enhanced schema models alongside legacy
- [ ] Create and test data mapper utility
- [ ] Implement dual-write capability
- [ ] Add feature flags for gradual rollout
- [ ] Create migration scripts
- [ ] Set up monitoring and logging
- [ ] Back up existing plant_data collection

### During Migration
- [ ] Run migration script on non-production environment
- [ ] Verify data integrity with validation script
- [ ] Test all API endpoints with both schemas
- [ ] Monitor performance metrics
- [ ] Gradually increase traffic to enhanced schema
- [ ] Address any errors or data inconsistencies

### Post-Migration
- [ ] Confirm 100% traffic on enhanced schema
- [ ] Stop dual writes
- [ ] Mark legacy collection as read-only
- [ ] Monitor for 30 days
- [ ] Archive/remove legacy collection
- [ ] Update documentation
- [ ] Rename plant_data_enhanced → plant_data

---

## Data Quality Improvements During Migration

Use migration as opportunity to improve data quality:

### 1. Flag Incomplete Records
```python
# Add metadata flag for records needing manual review
if not enhanced_data.fertilizerSchedule:
    enhanced_data.tags.append("NEEDS_FERTILIZER_SCHEDULE")

if not enhanced_data.diseasesAndPests:
    enhanced_data.tags.append("NEEDS_PEST_INFO")
```

### 2. Generate Reports
```python
# After migration, generate report of incomplete records
incomplete_records = await db.plant_data_enhanced.find({
    "tags": { "$in": ["NEEDS_FERTILIZER_SCHEDULE", "NEEDS_PEST_INFO"] }
}).to_list(length=None)

print(f"Records needing agronomist review: {len(incomplete_records)}")
```

### 3. Agronomist Review Process
```markdown
1. Export incomplete records to CSV
2. Assign to agronomists for data entry
3. Provide web form for bulk data entry
4. Validate and update records
5. Remove "NEEDS_*" tags when complete
```

---

## Timeline Summary

| Week | Phase | Activities |
|------|-------|-----------|
| 1 | Preparation | Deploy schemas, create mapper, test |
| 2 | Dual-Write | Implement dual writes, feature flags |
| 3 | Bulk Migration | Run migration scripts, verify data |
| 4 | Testing | Validate data, test queries, spot checks |
| 5-6 | Gradual Cutover | Route traffic to enhanced schema |
| 7 | 100% Cutover | All traffic on enhanced schema |
| 8+ | Deprecation | Stop dual writes, archive legacy |

**Total Timeline: 8-10 weeks for safe, zero-downtime migration**

---

## Support and Monitoring

### Key Metrics to Monitor
- Query performance (before/after)
- Error rates by schema type
- Data consistency checks
- API response times
- Database storage usage

### Alert Conditions
- Error rate > 1% on enhanced schema queries
- Response time > 2x legacy schema
- Data count mismatch between collections
- Failed migrations in logs

---

## Conclusion

This migration strategy prioritizes:
1. **Zero downtime** - Parallel schema approach
2. **Data safety** - Dual writes and validation
3. **Easy rollback** - Feature flags and monitoring
4. **Gradual transition** - Phase-based approach
5. **Data quality** - Opportunity to improve incomplete records

Follow this guide carefully, test thoroughly, and maintain backward compatibility throughout the migration process.
