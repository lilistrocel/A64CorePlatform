# Farm Management Module - User Interface Components

## User Interface Components

### 1. Farm Manager Views

#### Farm Dashboard
- **Layout**: Grid of farm cards
- **Each Farm Card Shows**:
  - Farm name and location
  - Total blocks count
  - Blocks by state (pie chart or bar chart)
  - Total predicted yield
  - Alert count (if any)
  - Recent activity
- **Actions**:
  - View farm details
  - Create new farm
  - Filter/search farms

#### Farm Detail View
- **Layout**: Block grid/list with visual indicators
- **Block Visual States**:
  - Empty: Gray
  - Planned: Blue
  - Planted: Green
  - Harvesting: Yellow/Orange
  - Alert: Red
- **Block Information**:
  - Block name
  - Current state
  - Plant types (if planted)
  - Predicted/actual yield
  - Days until harvest (if planted)
- **Actions**:
  - Create new block
  - Edit block
  - Delete block (if empty)
  - Plan planting (if empty)

#### Planting Planner
- **Step 1: Select Block**
  - Show empty blocks only
  - Display block capacity
- **Step 2: Select Plants**
  - Plant library with search/filter
  - Add multiple plant types
  - Set quantity for each
  - Real-time capacity validation
  - Show predicted yield per plant type
- **Step 3: Review & Confirm**
  - Summary of plants and quantities
  - Total predicted yield
  - Estimated harvest date
  - Capacity utilization percentage
- **Actions**:
  - Confirm plan
  - Save as draft
  - Cancel

### 2. Farmer Views

#### Farmer Dashboard
- **Layout**: Task-oriented view
- **Task Sections**:
  1. **Urgent Tasks** (red badge)
     - Alerts to resolve
     - Overdue harvests
  2. **Today's Tasks** (yellow badge)
     - Blocks ready to harvest
     - Scheduled maintenance
  3. **Upcoming Tasks** (blue badge)
     - Blocks to plant
     - Harvests in next 7 days
- **Assigned Farms**:
  - List of farms with quick stats
  - Navigation to farm view
- **Recent Activity**:
  - Timeline of completed tasks

#### Block Action View
- **For PLANNED blocks**:
  - Show planting plan
  - Button: "Mark as Planted"
  - Records date and user
- **For PLANTED blocks**:
  - Show plant types and quantities
  - Days since planted
  - Days until harvest
  - Button: "Report Alert" (if issue)
- **For HARVESTING blocks**:
  - Show expected yield
  - Form to record harvest:
    - Quantity per plant type
    - Quality grade
    - Notes
  - Button: "Complete Harvest"
- **For ALERT blocks**:
  - Show alert description
  - Who triggered, when
  - Form to resolve:
    - Resolution notes
  - Button: "Resolve Alert"

### 3. Agronomist Views

#### Plant Data Library
- **Layout**: Data table with search/filter
- **Columns**:
  - Plant name
  - Scientific name
  - Type
  - Growth cycle (days)
  - Expected yield
  - Actions (Edit, Delete)
- **Actions**:
  - Add new plant
  - Import CSV
  - Download template
  - Bulk edit
  - Filter by type
  - Search by name

#### Plant Data Form
- **Sections**:
  1. Basic Information
     - Plant name, scientific name, type
  2. Growth Cycle
     - Growth cycle days
  3. Environmental Requirements
     - Temperature range
     - Optimal pH range
     - Sunlight hours
  4. Care Schedule
     - Watering frequency
     - Fertilization schedule
     - Pesticide schedule
  5. Yield Information
     - Expected yield per plant
     - Yield unit
  6. Additional Notes
     - Cultivation notes
     - Tags
- **Validation**:
  - Required fields highlighted
  - Range validation (temperature, pH)
  - Real-time error messages

### 4. Shared Components

#### Block Card Component
```typescript
interface BlockCardProps {
  block: Block;
  onClick: () => void;
  showActions?: boolean;
}

// Visual design:
// - Color-coded by state
// - Icon for state
// - Block name prominent
// - Key info (plants, yield, days to harvest)
// - Action buttons (based on user role and state)
```

#### Yield Prediction Widget
```typescript
interface YieldPredictionProps {
  plants: PlantingItem[];
  maxCapacity: number;
}

// Displays:
// - Per-plant yield breakdown (bar chart)
// - Total predicted yield (large number)
// - Capacity utilization (gauge/progress bar)
// - Estimated harvest date
```

#### Farm Assignment Manager
```typescript
interface FarmAssignmentProps {
  farmId: string;
  currentAssignments: FarmAssignment[];
  onAssign: (userId: string, role: string) => void;
  onUnassign: (assignmentId: string) => void;
}

// Features:
// - List current assignments
// - Add new user (search users, select role)
// - Remove user
// - Change role
```

---



---

**[← Back to Index](./README.md)**
