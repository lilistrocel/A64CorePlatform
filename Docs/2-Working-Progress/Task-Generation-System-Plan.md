# Task Generation System - Implementation Plan

**Status**: In Progress
**Created**: 2025-11-19
**Phase**: Phase 1 - Basic Task Generation

## Overview

Tasks will be automatically generated when blocks transition states. Tasks serve as:
1. **Workflow Guides** - Structure farming operations
2. **Accountability Records** - Track who did what and when
3. **State Transition Triggers** - (Future phases) Enable task-driven state changes
4. **Harvest Recording** - (Future phases) Daily harvest tracking

## Architecture Decision

**Tasks are generated BEFORE block state changes** (not after):
- Task generation is part of state transition validation
- If task generation fails, state transition fails (atomicity)
- Tasks exist immediately after state change completes
- Ensures consistency between block state and task list

## Edge Cases & Business Rules

### Task Permissions
- **Farmers**: Can complete tasks, cannot cancel tasks
- **Managers**: Can complete tasks, can cancel tasks, can override workflow

### Task Completion
- **First to complete wins** - Use optimistic locking or atomic updates
- Only one user can complete a specific task instance
- Completed tasks are immutable (record-keeping)

### Overdue Tasks
- Tasks with `scheduledDate` in the past are marked as overdue
- Overdue tasks display in **red** in the UI
- Overdue tasks still completable (no auto-cancellation)
- Notifications sent for overdue critical tasks

## Phase 1: Basic Task Generation (Current)

### Scope
Generate tasks automatically when blocks transition states. Tasks are for **record-keeping and guidance** only.

### State Transition → Task Mapping

#### 1. EMPTY → PLANNED
**Generated Task**: "Plant {crop_name} on {planned_date}"
- **Type**: `state_transition`
- **Scheduled Date**: `plannedPlantingDate` from block
- **Description**: "Plant {plant_count} {crop_name} plants in Block {block_name}"
- **Completion Trigger**: (Phase 2) Transitions block to GROWING
- **Skip Condition**: If planned date is today, generate immediate task

#### 2. PLANNED → GROWING
**Generated Tasks**:
- If plant has fruiting days:
  - **Task**: "Check if {crop_name} is fruiting"
  - **Scheduled Date**: `expectedStatusChanges.fruiting`
  - **Completion Trigger**: (Phase 2) Transitions to FRUITING
- If no fruiting days:
  - **Task**: "Start harvesting {crop_name}"
  - **Scheduled Date**: `expectedStatusChanges.harvesting`
  - **Completion Trigger**: (Phase 2) Transitions to HARVESTING

#### 3. GROWING → FRUITING
**Generated Task**: "Start harvesting {crop_name}"
- **Scheduled Date**: `expectedStatusChanges.harvesting`
- **Description**: "Begin harvest operations for Block {block_name}"
- **Completion Trigger**: (Phase 2) Transitions to HARVESTING

#### 4. GROWING/FRUITING → HARVESTING
**Generated Task**: "Daily harvest for {crop_name}"
- **Type**: `harvest_recording`
- **Scheduled Date**: Current date
- **Recurrence**: Daily (auto-generate new task at 00:00)
- **Harvest Data**: Accumulates multiple harvest entries per day
- **Auto-Complete**: At 00:00, summarize day's harvest and mark complete
- **Special Actions**: (Phase 3)
  - **Harvest Button**: Record quantity + grade (multiple clicks allowed)
  - **End Harvest Button**: Choose next state (cleaning or growing)

#### 5. HARVESTING → CLEANING
**Generated Task**: "Clean and sanitize Block {block_name}"
- **Scheduled Date**: Current date + 1 day
- **Description**: "Clean block after harvest, prepare for next cycle"
- **Completion Trigger**: (Phase 2) Transitions to EMPTY

### Implementation Components

#### 1. TaskGeneratorService
```python
class TaskGeneratorService:
    @staticmethod
    async def generate_tasks_for_transition(
        block_id: UUID,
        from_state: BlockStatus,
        to_state: BlockStatus,
        plant_data: PlantDataEnhanced,
        expected_dates: dict,
        user_id: UUID,
        user_email: str
    ) -> List[FarmTask]:
        """Generate tasks based on state transition"""
```

#### 2. FarmTask Model Updates
```python
class FarmTask:
    # Existing fields...

    # New fields for Phase 1
    taskType: Literal['state_transition', 'monitoring', 'harvest_recording']
    triggerStateChange: Optional[BlockStatus]  # What state to transition to
    isOverdue: bool = False  # Computed property

    # Future phase fields
    requiresCompletion: bool = False  # Block state transition until complete
    harvestData: List[HarvestEntry] = []  # For harvest recording tasks
```

#### 3. BlockService Integration
```python
async def change_status(...) -> Block:
    # Validate transition
    if not validate_status_transition(...):
        raise HTTPException(400, "Invalid transition")

    # Generate tasks BEFORE state change
    tasks = await TaskGeneratorService.generate_tasks_for_transition(
        block_id=block_id,
        from_state=current_block.state,
        to_state=new_status,
        plant_data=plant_data,
        expected_dates=expected_status_changes,
        user_id=user_id,
        user_email=user_email
    )

    # If task generation fails, don't change state
    if not tasks:
        raise HTTPException(500, "Failed to generate tasks for transition")

    # Update block status
    block = await BlockRepository.update_status(...)

    return block
```

## Phase 2: Task-Driven Transitions (Future)

### Scope
- Add "Complete & Transition" button to tasks
- Completing certain tasks offers to change block state
- Still allow manual transitions (with warning if tasks incomplete)

### Changes Required
- UI updates for task completion actions
- Task completion endpoint triggers state transition
- Warning modals for manual transitions with pending tasks

## Phase 3: Harvest Recording Integration (Future)

### Scope
- Daily harvest task with multiple entries per day
- Background job at 00:00 to auto-complete and summarize
- "End Harvest" workflow with cleaning/growing choice

### Changes Required
- Background scheduler (Celery/APScheduler)
- Harvest data accumulation in tasks
- Multi-choice completion UI

## Phase 4: Workflow Enforcement (Future)

### Scope
- Optionally require task completion for state transitions
- Role-based permissions (farmers must complete, managers can skip)
- Configuration per farm or system-wide

### Changes Required
- Configuration settings
- Permission checks in state transition
- Override mechanism for managers

## Testing Strategy

### Phase 1 Testing
1. **E2E Test**: Create block → Plan with crop → Verify tasks generated
2. **Unit Tests**: Each state transition generates correct tasks
3. **Edge Cases**:
   - Task generation failure prevents state change
   - Multiple simultaneous transitions (race condition)
   - Overdue task detection

### Integration Points
- Operations Task Manager UI already exists
- Block Monitor already displays block states
- Alert system integration (existing)

## Success Metrics

### Phase 1
- ✅ Tasks auto-generated for all state transitions
- ✅ Task list populates in Operations page
- ✅ Overdue tasks display in red
- ✅ State transitions atomic (tasks + state or neither)

### Future Phases
- Task completion drives 80%+ of state transitions
- Harvest recording via tasks (not separate form)
- Reduced manual data entry errors
- Complete audit trail of all farming operations

## Related Documentation
- [Operations Task Manager](./Operations-Task-Manager.md)
- [API Structure](../1-Main-Documentation/API-Structure.md)
- [System Architecture](../1-Main-Documentation/System-Architecture.md)
