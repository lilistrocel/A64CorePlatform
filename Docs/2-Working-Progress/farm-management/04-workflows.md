# Farm Management Module - State Machine & Workflows

## State Machine & Workflows

### Block State Machine

```
┌─────────┐
│  EMPTY  │  Initial state, no planting
└────┬────┘
     │
     │ Farm Manager creates planting plan
     │
     ▼
┌─────────┐
│ PLANNED │  Planting plan created, not yet planted
└────┬────┘
     │
     │ Farmer marks as planted (records date)
     │
     ▼
┌─────────┐
│ PLANTED │  Plants in ground, growing
└────┬────┘
     │
     │ Automatic: First plant reaches harvest window
     │
     ▼
┌────────────┐
│ HARVESTING │  Ready to harvest
└─────┬──────┘
      │
      │ Farmer ends harvest (records quantity)
      │
      ▼
┌─────────┐
│  EMPTY  │  Harvest complete, block ready for next cycle
└─────────┘

ALERT State (temporary):
Any state can transition to ALERT when farmer triggers alert.
When resolved, block returns to previous state.
```

### State Transition Rules

#### 1. EMPTY → PLANNED
- **Triggered by**: Farm Manager creates planting plan
- **Preconditions**:
  - Block must be in EMPTY state
  - User must have `farm.manage` permission
  - Total plants in plan ≤ block.maxPlants
- **Actions**:
  - Create `Planting` document (status="planned")
  - Update block:
    - `state` = "planned"
    - `currentPlanting` = plantingId
  - Calculate and store predicted yield
  - Calculate estimated harvest dates
- **Validation**:
  - All plantDataIds must exist
  - Quantities must be > 0
  - Sum of quantities ≤ maxPlants

#### 2. PLANNED → PLANTED
- **Triggered by**: Farmer marks block as planted
- **Preconditions**:
  - Block must be in PLANNED state
  - User must have `farm.operate` permission
  - User must be assigned to this farm
- **Actions**:
  - Update `Planting` document:
    - `status` = "planted"
    - `plantedBy` = userId
    - `plantedByEmail` = userEmail
    - `plantedAt` = now()
    - Calculate harvest window based on planting date
  - Update block:
    - `state` = "planted"
    - `plantedDate` = now()
    - `estimatedHarvestDate` = plantedDate + min(growthCycleDays)
- **Data captured**:
  - Planting date
  - Who planted
  - Plant data snapshot (frozen at this moment)

#### 3. PLANTED → HARVESTING
- **Triggered by**: Automatic (daily background job)
- **Preconditions**:
  - Block must be in PLANTED state
  - Current date ≥ estimatedHarvestDate
- **Actions**:
  - Update `Planting` document:
    - `status` = "harvesting"
  - Update block:
    - `state` = "harvesting"
- **Notifications**:
  - Notify assigned farmers
  - Show in farmer dashboard

#### 4. HARVESTING → EMPTY
- **Triggered by**: Farmer ends harvest
- **Preconditions**:
  - Block must be in HARVESTING state
  - User must have `farm.operate` permission
  - User must be assigned to this farm
- **Actions**:
  - Create `Harvest` document:
    - Record harvest quantities by plant type
    - Calculate actual vs predicted yield
    - Record harvester and dates
  - Update `Planting` document:
    - `status` = "completed"
  - Update block:
    - `state` = "empty"
    - Clear `currentPlanting`
    - Clear `plantedDate`
    - Clear `estimatedHarvestDate`
- **Data captured**:
  - Harvest quantities per plant type
  - Harvest start and end dates
  - Quality grades
  - Yield efficiency

#### 5. ANY STATE → ALERT
- **Triggered by**: Farmer triggers alert
- **Preconditions**:
  - Block must not already be in ALERT state
  - User must have `farm.operate` permission
- **Actions**:
  - Update block:
    - `previousState` = current state
    - `state` = "alert"
    - `alertDescription` = description
    - `alertTriggeredAt` = now()
- **Data captured**:
  - Alert description
  - Who triggered
  - When triggered

#### 6. ALERT → Previous State
- **Triggered by**: Farmer resolves alert
- **Preconditions**:
  - Block must be in ALERT state
  - User must have `farm.operate` or `farm.manage` permission
- **Actions**:
  - Update block:
    - `state` = previousState
    - Clear `alertDescription`
    - Clear `alertTriggeredAt`
    - Clear `previousState`
- **Data captured**:
  - Resolution notes
  - Who resolved
  - When resolved

### User Workflows

#### Workflow 1: Farm Manager Plans Planting

```
1. Farm Manager logs in
2. Views farm dashboard → sees all their farms
3. Selects a farm → views all blocks
4. Selects an EMPTY block
5. Clicks "Plan Planting"
6. System shows:
   - Block capacity: maxPlants
   - Available plant data library
7. Manager selects plants:
   - Select "Tomato" → quantity: 50
   - Select "Basil" → quantity: 30
   - Total: 80 plants (validated ≤ maxPlants)
8. System calculates:
   - Predicted yield: 265 kg
   - Estimated harvest date: based on longest growth cycle
9. Manager reviews and confirms
10. System creates planting plan
11. Block state changes: EMPTY → PLANNED
12. Assigned farmers receive notification
```

#### Workflow 2: Farmer Plants Block

```
1. Farmer logs in
2. Views assigned farms dashboard
3. Sees blocks in PLANNED state
4. Physically plants the crops
5. Opens block in app
6. Clicks "Mark as Planted"
7. System records:
   - Planting date = today
   - Planted by = farmer
8. Block state changes: PLANNED → PLANTED
9. System calculates harvest window
```

#### Workflow 3: Farmer Harvests Block

```
1. Daily background job checks all PLANTED blocks
2. If current date ≥ estimated harvest date:
   - Block state changes: PLANTED → HARVESTING
   - Farmers receive notification
3. Farmer logs in → sees HARVESTING blocks
4. Farmer harvests crops over several days
5. When complete, farmer clicks "End Harvest"
6. System prompts for harvest data:
   - Tomato: 240 kg (grade A)
   - Basil: 14 kg (grade A)
7. System calculates:
   - Total: 254 kg
   - Efficiency: 254/265 = 95.8%
8. Farmer confirms
9. System:
   - Creates Harvest record
   - Block state changes: HARVESTING → EMPTY
   - Shows yield comparison
```

#### Workflow 4: Farmer Triggers Alert

```
1. Farmer inspecting field notices pest infestation
2. Opens block in app (any state except ALERT)
3. Clicks "Report Alert"
4. Enters description: "Aphid infestation on tomatoes"
5. System:
   - Saves previous state
   - Block state changes: * → ALERT
   - Notifies farm manager
6. Manager sees alert, takes action
7. Once resolved:
   - Manager or farmer clicks "Resolve Alert"
   - Enters resolution notes
   - Block state changes: ALERT → previous state
```

---



---

**[← Back to Index](./README.md)**
