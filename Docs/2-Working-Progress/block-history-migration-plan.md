# Block History Migration Plan

## Overview

Migrate historical block planting cycles and daily harvest records from OldData to our new MongoDB schema and sync to remote database.

## Data Sources

### 1. Block History (`OldData/json_exports/block_history_comp.json`) [RECOMMENDED]
- **Purpose**: Completed planting cycles (one record per block per season)
- **Records**: 884 total
- **Unique blocks**: 881
- **Unique crops**: 42
- **Farms**: 6 (New Hydroponics: 266, Al Ain: 235, Liwa: 208, Al Khazana: 83, Al Wagen: 63, Silal Upgrade Farm: 29)

**Note**: Two files exist with same 884 records:
- `block_history.json` - Basic fields
- `block_history_comp.json` - **Use this one** - Has additional fields (fertilizer, sowing duration, seeds per drip)

**Source Schema (block_history_comp.json):**
```json
{
  "ref": "uuid",                          // Unique cycle ID
  "block_id": "A-43-1",                   // Block code (needs mapping to our block)
  "farm_id": "Al Ain",                    // Farm name (needs mapping to farmId UUID)
  "farm_block_ref": "uuid",               // Old system block reference
  "crop_id": "Zucchini - Green",          // Crop name (needs mapping to plantDataId)
  "time_start": "2024-09-15T17:00:00Z",   // Planting date
  "time_finish": "2024-10-19T17:00:00Z",  // Harvest end date
  "time_cleaned": "2024-11-18T17:00:00Z", // When cleaned/reset
  "state": "Cleaned",                     // Final state
  "farm_type": "Open Field",              // Block type
  "area": 2898,                           // Area in sqm
  "drips": 6040,                          // Plant count (maxPlants)
  "predicted_yield": 15402,               // Expected yield in kg
  "harvest_data": 10320,                  // Actual yield in kg
  "kpi": 0.670043,                        // Yield efficiency (actual/predicted)
  "plannedseason": 1,                     // Season number
  "viewing_year": 2024,                   // Year
  "yieldperseed": 1.70861,                // Yield per seed/plant

  // Additional fields in _comp version:
  "HarvestDurationday": 30,               // Days of harvesting
  "SowingDurationday": 45,                // Growing duration in days
  "NetYieldPerDripkg": 2.55,              // Net yield per drip/plant in kg
  "seedsPerDrip": 4,                      // Seeds per drip point
  "PlanningFertilizer": {                 // Detailed fertilizer schedule
    "Day": [3, 4, 5, ...],
    "Urea": [1.5, 1.5, ...],
    "...": "..."
  }
}
```

### 2. Harvest Reports (`OldData/json_exports/harvest_reports.json`)
- **Purpose**: Daily harvest records (multiple records per block per season)
- **Records**: 10,079 total
- **Unique blocks**: 834
- **Unique crops**: 43
- **Farms**: 6 (Al Ain: 4088, Liwa: 2476, Al Khazana: 1287, Al Wagen: 945, Silal Upgrade Farm: 916, New Hydroponics: 367)

**Source Schema:**
```json
{
  "ref": "uuid",                          // Unique harvest ID
  "block_id": "A-43-1",                   // Block code
  "farm": "Al Ain",                       // Farm name
  "farm_block_ref": "uuid",               // Old system block reference
  "crop": "Zucchini - Green",             // Crop name
  "Quantity": 409,                        // Harvest quantity in kg
  "time": "2025-09-15T00:00:00Z",         // Harvest date
  "harvestSeason": 1,                     // Season number
  "reporter_user": "samah@agrinovame.com",// Who recorded
  "main_block": "A-43",                   // Parent block code
  "main_block_ref": "uuid",               // Parent block ref
  "viewing_year": 2025                    // Year
}
```

## Target Schema

### 1. Block Archives Collection (`block_archives`)
Maps to: `src/modules/farm_manager/models/block_archive.py`

**Target Schema:**
```python
BlockArchive:
  archiveId: UUID              # Generate new or use ref
  blockId: UUID                # Our block's blockId (needs mapping)
  blockCode: str               # Block name/code
  farmId: UUID                 # Our farm's farmId (needs mapping)
  farmName: str                # Farm name
  blockType: BlockType         # Map from farm_type
  maxPlants: int               # From drips field
  actualPlantCount: int        # From drips field
  area: float                  # From area field (already in sqm)
  areaUnit: str                # "sqm"
  targetCrop: UUID             # plantDataId (needs mapping)
  targetCropName: str          # From crop_id
  plantedDate: datetime        # From time_start
  harvestCompletedDate: datetime # From time_finish or time_cleaned
  cycleDurationDays: int       # Calculate from dates
  predictedYieldKg: float      # From predicted_yield
  actualYieldKg: float         # From harvest_data
  yieldEfficiencyPercent: float # From kpi * 100
  totalHarvests: int           # Count from harvest_reports
  qualityBreakdown: {...}      # Default empty (no quality data in source)
  statusChanges: [...]         # Reconstruct from dates
  alertsSummary: {...}         # Default empty (no alerts in source)
  archivedAt: datetime         # Use time_cleaned
  archivedBy: UUID             # System user
  archivedByEmail: str         # "migration@system"
```

### 2. Block Harvests Collection (`block_harvests`)
Maps to: `src/modules/farm_manager/models/block_harvest.py`

**Target Schema:**
```python
BlockHarvest:
  harvestId: UUID              # Generate new or use ref
  blockId: UUID                # Our block's blockId (needs mapping)
  farmId: UUID                 # Our farm's farmId (needs mapping)
  harvestDate: datetime        # From time
  quantityKg: float            # From Quantity
  qualityGrade: QualityGrade   # Default "A" (no quality data)
  notes: str                   # "Migrated from legacy system"
  recordedBy: UUID             # System user
  recordedByEmail: str         # From reporter_user or "migration@system"
  createdAt: datetime          # From time
```

## Migration Challenges

### 1. Block ID Mapping
- Old system uses codes like "A-43-1", "LW-54", "AG-06-001"
- Our system uses UUIDs with `name` field containing "A43", "LW54", "AG06"
- **Solution**: Create mapping table from old block codes to new block UUIDs
- **Challenge**: Some old blocks may not exist in current system (need to skip or create)

### 2. Farm ID Mapping
- Old system uses farm names: "Al Ain", "Liwa", "Al Khazana", etc.
- Our system uses UUIDs
- **Solution**: Simple lookup table (6 farms)

### 3. Plant/Crop ID Mapping
- Old system uses crop names: "Tomato-OF", "Cucumber", "Zucchini - Green"
- Our system uses plantDataId UUIDs
- **Solution**: Lookup by plant name in plant_data_enhanced collection
- **Challenge**: Some old crops may not exist (need to skip or create placeholder)

### 4. Block Type Mapping
```
Old System        -> Our System
"Open Field"      -> "openfield"
"Green House"     -> "greenhouse"
"Net House"       -> "nethouse"
"Hydroponic"      -> "hydroponic"
```

### 5. Data Quality Issues
- Some records have `harvest_data: 0` (no actual harvest)
- Some records have `area: 0` (missing area data)
- Some blocks in history may not exist in our current blocks collection

## Implementation Plan

### Phase 1: Preparation (Local)
1. **Create mapping tables**
   - [ ] Farm name -> farmId UUID mapping
   - [ ] Block code -> blockId UUID mapping (query current blocks)
   - [ ] Crop name -> plantDataId UUID mapping (query plant_data_enhanced)

2. **Data validation**
   - [ ] Identify blocks in history that don't exist in current system
   - [ ] Identify crops in history that don't exist in plant_data
   - [ ] Generate report of unmapped records

3. **Create migration script**
   - [ ] `scripts/migrations/migrate_block_history.py`
   - [ ] Include dry-run mode
   - [ ] Include logging and error handling
   - [ ] Support incremental migration (skip already migrated)

### Phase 2: Migration Script Development
1. **Block Archives Migration**
   ```python
   # Pseudocode
   for history_record in block_history:
       block = find_block_by_code(history_record.block_id)
       farm = find_farm_by_name(history_record.farm_id)
       plant = find_plant_by_name(history_record.crop_id)

       if not block or not farm:
           log_warning("Skipping unmapped record")
           continue

       archive = BlockArchive(
           archiveId=history_record.ref or uuid4(),
           blockId=block.blockId,
           farmId=farm.farmId,
           ...
       )

       # Calculate total harvests from harvest_reports
       harvests = count_harvests(history_record.block_id, history_record.time_start, history_record.time_finish)
       archive.totalHarvests = len(harvests)

       save_archive(archive)
   ```

2. **Block Harvests Migration**
   ```python
   for harvest_record in harvest_reports:
       block = find_block_by_code(harvest_record.block_id)
       farm = find_farm_by_name(harvest_record.farm)

       if not block or not farm:
           log_warning("Skipping unmapped harvest")
           continue

       harvest = BlockHarvest(
           harvestId=harvest_record.ref or uuid4(),
           blockId=block.blockId,
           farmId=farm.farmId,
           harvestDate=harvest_record.time,
           quantityKg=harvest_record.Quantity,
           qualityGrade="A",  # Default
           recordedByEmail=harvest_record.reporter_user,
           ...
       )

       save_harvest(harvest)
   ```

### Phase 3: Local Testing
1. Run migration on local database
2. Verify data integrity
3. Test UI displays archives and harvests correctly
4. Test analytics calculations with migrated data

### Phase 4: Remote Sync
1. Copy migration script to remote server
2. Run migration on remote database
3. Verify remote data matches local
4. Test production UI

## File Structure

```
scripts/migrations/
├── migrate_block_history.py      # Main migration script
├── block_history_mappings.py     # Mapping tables/functions
└── validate_migration.py         # Post-migration validation

OldData/json_exports/
├── block_history.json            # Source: planting cycles
└── harvest_reports.json          # Source: daily harvests
```

## Risk Mitigation

1. **Backup before migration**
   - Backup both local and remote databases
   - Export current block_archives and block_harvests collections

2. **Dry-run mode**
   - Run script with `--dry-run` flag first
   - Review logs before actual migration

3. **Incremental approach**
   - Migrate one farm at a time
   - Verify each farm before proceeding

4. **Rollback plan**
   - Keep mapping of migrated records
   - Script to delete migrated records if needed

## Success Criteria

1. All valid block history records migrated to block_archives
2. All valid harvest reports migrated to block_harvests
3. Block detail pages show historical cycles
4. Farm statistics include historical data
5. No duplicate records
6. Remote and local databases synchronized

## Estimated Effort

| Phase | Task | Estimate |
|-------|------|----------|
| 1 | Create mappings | 1-2 hours |
| 2 | Develop migration script | 2-3 hours |
| 3 | Local testing | 1 hour |
| 4 | Remote sync | 30 min |
| **Total** | | **4-6 hours** |

## Questions to Resolve Before Starting

1. **What to do with unmapped blocks?**
   - Option A: Skip them (data loss)
   - Option B: Create placeholder blocks
   - Option C: Store in separate "orphan" collection

2. **What to do with unmapped crops?**
   - Option A: Skip those records
   - Option B: Create placeholder plant entries
   - Option C: Use a generic "Unknown Crop" entry

3. **Should we preserve old UUIDs (ref field)?**
   - Pro: Easier to trace back to source data
   - Con: May conflict if UUIDs not truly unique

4. **Quality grade handling?**
   - Old data doesn't have quality breakdown
   - Default all to "A" or mark as "Unknown"?
