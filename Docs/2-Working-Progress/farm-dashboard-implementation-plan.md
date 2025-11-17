# Farm Dashboard Implementation Plan

**Version:** 2.0
**Date:** 2025-11-17
**Status:** Planning Phase
**Document Type:** Technical Implementation Guide

---

## Table of Contents

1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Data Strategy](#data-strategy)
4. [Configuration System](#configuration-system)
5. [Compact Layout Design](#compact-layout-design)
6. [State-Specific Card Designs](#state-specific-card-designs)
7. [Offset Tracking System](#offset-tracking-system)
8. [Harvest Variance Tracking](#harvest-variance-tracking)
9. [Historical Analysis](#historical-analysis)
10. [Component Structure](#component-structure)
11. [API Endpoints](#api-endpoints)
12. [Implementation Phases](#implementation-phases)

---

## Overview

### Purpose
Create a high-density, real-time farm dashboard for managers to monitor all blocks in a single farm at a glance. The dashboard provides instant visibility into block states, harvest progress, timeline adherence, and performance metrics.

### Key Features
- **Farm-Specific View**: Select and monitor one farm at a time
- **High-Density Layout**: 8 blocks per row on desktop (compact 280px cards)
- **State-Based Color Coding**: Visual indicators for all 8 block states
- **Performance Tracking**: Track yields up to 300%+ of predicted
- **Timeline Intelligence**: Track early/late transitions with offset recording
- **Configurable Theme**: Customizable colors, icons, and layout density
- **Historical Learning**: All variances recorded for future analytics

### Target Users
- Farm Managers
- Operations Coordinators
- Agronomists
- Farm Owners

---

## System Architecture

### Data Flow
```
PlantData (yieldPerPlant) × Block (actualPlantCount) = Predicted Yield
                                    ↓
                          Block stores KPI:
                          - predictedYieldKg
                          - actualYieldKg (cumulative from harvests)
                          - yieldEfficiencyPercent
                          - totalHarvests
```

### Architecture Pattern
```
Frontend (React/TypeScript)
    ↓ (REST API)
Backend FastAPI
    ↓ (MongoDB)
Database (blocks, plant_data, harvests)
```

---

## Data Strategy

### Approach: Backend API Endpoint (RECOMMENDED)

**Endpoint:** `GET /api/v1/farm/farms/{farmId}/dashboard`

#### Why Backend Calculation?
1. ✅ **Single Database Query**: Fetch all blocks for farm in one call
2. ✅ **Server-Side Calculation**: Calculate aggregations on backend
3. ✅ **Reduced Network Traffic**: Send compact, pre-calculated data
4. ✅ **Caching**: Can cache dashboard data for 30-60 seconds
5. ✅ **Historical Analysis**: Backend already has harvest data, status changes

#### Data Payload Structure

```typescript
{
  // Farm metadata
  farmInfo: {
    farmId: UUID,
    name: string,
    code: string,              // e.g., "F001"
    totalArea: number,
    areaUnit: string,
    managerName: string,
    managerEmail: string
  },

  // Aggregated summary
  summary: {
    totalBlocks: number,
    blocksByState: {
      empty: number,
      planned: number,
      planted: number,
      growing: number,
      fruiting: number,
      harvesting: number,
      cleaning: number,
      alert: number
    },
    totalActivePlantings: number,
    totalPredictedYieldKg: number,
    totalActualYieldKg: number,
    avgYieldEfficiency: number,
    activeAlerts: {
      critical: number,
      high: number,
      medium: number,
      low: number
    }
  },

  // Individual blocks with calculated fields
  blocks: [
    {
      // Core block data
      blockId: UUID,
      blockCode: string,        // e.g., "F001-005"
      name: string,
      state: BlockState,
      blockType: string,

      // Planting info
      targetCrop: UUID | null,
      targetCropName: string | null,
      actualPlantCount: number,
      maxPlants: number,

      // Dates & timeline
      plantedDate: datetime | null,
      expectedHarvestDate: datetime | null,
      expectedStatusChanges: {
        planted?: datetime,
        growing?: datetime,
        fruiting?: datetime,
        harvesting?: datetime,
        cleaning?: datetime
      },

      // KPI
      kpi: {
        predictedYieldKg: number,
        actualYieldKg: number,
        yieldEfficiencyPercent: number,
        totalHarvests: number
      },

      // CALCULATED FIELDS (backend does this)
      calculated: {
        // Timeliness tracking
        daysInCurrentState: number,
        expectedStateChangeDate: datetime | null,
        daysUntilNextTransition: number | null,
        isDelayed: boolean,
        delayDays: number,           // negative = early, positive = late

        // Capacity
        capacityPercent: number,

        // Yield performance (for harvesting state)
        yieldProgress: number,       // actualYield / predictedYield * 100
        yieldStatus: "on_track" | "ahead" | "behind",
        estimatedFinalYield: number, // extrapolation based on current rate
        performanceCategory: "exceptional" | "exceeding" | "excellent" | "good" | "acceptable" | "poor",

        // Next action
        nextAction: "transition_to_growing" | "transition_to_fruiting" | "transition_to_harvesting" | "record_harvest" | "plant_crop" | "clean_block",
        nextActionDate: datetime | null
      },

      // Alerts
      activeAlerts: [
        {
          alertId: UUID,
          severity: "critical" | "high" | "medium" | "low",
          title: string,
          createdAt: datetime
        }
      ]
    }
  ],

  // Recently updated blocks
  recentActivity: [
    {
      blockId: UUID,
      blockCode: string,
      action: "state_change" | "harvest_recorded" | "alert_created",
      details: string,
      timestamp: datetime
    }
  ],

  // Upcoming events (next 7 days)
  upcomingEvents: [
    {
      blockId: UUID,
      blockCode: string,
      eventType: "expected_harvest" | "expected_planting" | "expected_transition",
      eventDate: datetime,
      daysUntil: number
    }
  ]
}
```

---

## Configuration System

### Configuration Structure

All configuration stored in `localStorage` with key `farm-dashboard-config`.

```typescript
interface DashboardConfig {
  version: "1.0",

  // Color Theme
  colorScheme: {
    stateColors: {
      empty: string,           // Default: "#9E9E9E"
      planned: string,         // Default: "#3B82F6"
      planted: string,         // Default: "#10B981"
      growing: string,         // Default: "#34D399"
      fruiting: string,        // Default: "#FCD34D"
      harvesting: string,      // Default: "#F59E0B"
      cleaning: string,        // Default: "#A855F7"
      alert_critical: string,  // Default: "#DC2626"
      alert_high: string,      // Default: "#F97316"
      alert_medium: string,    // Default: "#FCD34D"
      alert_low: string        // Default: "#FDE68A"
    },

    performanceColors: {
      exceptional: string,     // Default: "#10B981" (>= 200%)
      exceeding: string,       // Default: "#34D399" (100-199%)
      excellent: string,       // Default: "#3B82F6" (90-99%)
      good: string,            // Default: "#FCD34D" (70-89%)
      acceptable: string,      // Default: "#F97316" (50-69%)
      poor: string             // Default: "#DC2626" (<50%)
    },

    timelinessColors: {
      early: string,           // Default: "#3B82F6"
      onTime: string,          // Default: "#10B981"
      slightlyLate: string,    // Default: "#FCD34D" (1-3 days)
      late: string,            // Default: "#F97316" (4-7 days)
      veryLate: string         // Default: "#DC2626" (8+ days)
    }
  },

  // Icon Set
  iconSet: "emoji" | "material" | "fontawesome",
  icons: {
    states: {
      empty: string,           // Default: "⬜"
      planned: string,         // Default: "📋"
      planted: string,         // Default: "🌱"
      growing: string,         // Default: "🌿"
      fruiting: string,        // Default: "🍎"
      harvesting: string,      // Default: "🌾"
      cleaning: string,        // Default: "🧹"
      alert: string            // Default: "⚠️"
    },
    metrics: {
      farm: string,            // Default: "🏞️"
      block: string,           // Default: "🏗️"
      plant: string,           // Default: "🌱"
      harvest: string,         // Default: "🌾"
      efficiency: string,      // Default: "📊"
      alert: string            // Default: "🚨"
    },
    actions: {
      view: string,            // Default: "👁️"
      edit: string,            // Default: "✏️"
      delete: string,          // Default: "🗑️"
      plant: string,           // Default: "🌱"
      harvest: string,         // Default: "✂️"
      transition: string       // Default: "➡️"
    }
  },

  // Layout Preferences
  layout: {
    cardSize: "compact" | "medium" | "large",    // Default: "compact"
    cardsPerRow: 4 | 6 | 8,                      // Default: 8
    showBlockCode: boolean,                      // Default: true
    showBlockName: boolean,                      // Default: true
    showCapacityBar: boolean,                    // Default: true
    showExpectedDates: boolean,                  // Default: true
    showKPIPreview: boolean                      // Default: true
  },

  // Data Display
  dataDisplay: {
    yieldUnit: "kg" | "lbs" | "tons",           // Default: "kg"
    dateFormat: "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD",  // Default: "DD/MM/YYYY"
    showPercentages: boolean,                    // Default: true
    decimalPlaces: number                        // Default: 1
  }
}
```

### Default Configuration

```typescript
const DEFAULT_CONFIG: DashboardConfig = {
  version: "1.0",
  colorScheme: {
    stateColors: {
      empty: "#9E9E9E",
      planned: "#3B82F6",
      planted: "#10B981",
      growing: "#34D399",
      fruiting: "#FCD34D",
      harvesting: "#F59E0B",
      cleaning: "#A855F7",
      alert_critical: "#DC2626",
      alert_high: "#F97316",
      alert_medium: "#FCD34D",
      alert_low: "#FDE68A"
    },
    performanceColors: {
      exceptional: "#10B981",
      exceeding: "#34D399",
      excellent: "#3B82F6",
      good: "#FCD34D",
      acceptable: "#F97316",
      poor: "#DC2626"
    },
    timelinessColors: {
      early: "#3B82F6",
      onTime: "#10B981",
      slightlyLate: "#FCD34D",
      late: "#F97316",
      veryLate: "#DC2626"
    }
  },
  iconSet: "emoji",
  icons: {
    states: {
      empty: "⬜",
      planned: "📋",
      planted: "🌱",
      growing: "🌿",
      fruiting: "🍎",
      harvesting: "🌾",
      cleaning: "🧹",
      alert: "⚠️"
    },
    metrics: {
      farm: "🏞️",
      block: "🏗️",
      plant: "🌱",
      harvest: "🌾",
      efficiency: "📊",
      alert: "🚨"
    },
    actions: {
      view: "👁️",
      edit: "✏️",
      delete: "🗑️",
      plant: "🌱",
      harvest: "✂️",
      transition: "➡️"
    }
  },
  layout: {
    cardSize: "compact",
    cardsPerRow: 8,
    showBlockCode: true,
    showBlockName: true,
    showCapacityBar: true,
    showExpectedDates: true,
    showKPIPreview: true
  },
  dataDisplay: {
    yieldUnit: "kg",
    dateFormat: "DD/MM/YYYY",
    showPercentages: true,
    decimalPlaces: 1
  }
};
```

### Color Theme Presets

```typescript
const COLOR_PRESETS = {
  default: { /* DEFAULT_CONFIG colors */ },

  colorblindSafe: {
    stateColors: {
      empty: "#808080",
      planned: "#0072B2",
      planted: "#009E73",
      growing: "#56B4E9",
      fruiting: "#E69F00",
      harvesting: "#F0E442",
      cleaning: "#CC79A7",
      alert_critical: "#D55E00",
      alert_high: "#E69F00",
      alert_medium: "#F0E442",
      alert_low: "#56B4E9"
    }
  },

  highContrast: {
    stateColors: {
      empty: "#000000",
      planned: "#0000FF",
      planted: "#00FF00",
      growing: "#00FFFF",
      fruiting: "#FFFF00",
      harvesting: "#FF8800",
      cleaning: "#FF00FF",
      alert_critical: "#FF0000",
      alert_high: "#FF4400",
      alert_medium: "#FFAA00",
      alert_low: "#FFEE00"
    }
  },

  pastel: {
    stateColors: {
      empty: "#D3D3D3",
      planned: "#A8D5F2",
      planted: "#B8E6D5",
      growing: "#C4F0E0",
      fruiting: "#FFE5B4",
      harvesting: "#FFD4A8",
      cleaning: "#E5CCFF",
      alert_critical: "#FFB3B3",
      alert_high: "#FFCC99",
      alert_medium: "#FFF4CC",
      alert_low: "#FFFFCC"
    }
  }
};
```

---

## Compact Layout Design

### Card Dimensions

**Compact Size (Default):**
- Width: `280px`
- Height: `~200px` (varies by state)
- Gap: `16px`

**Responsive Grid:**
- Desktop (>1920px): 8 cards per row
- Large Desktop (1440-1920px): 6 cards per row
- Desktop (1024-1440px): 4 cards per row
- Tablet (768-1024px): 2 cards per row
- Mobile (<768px): 1 card per row

### Grid Layout CSS

```css
.block-grid {
  display: grid;
  gap: 16px;
  padding: 24px;

  /* 8 cards per row on large screens */
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));

  /* Maximum 8 columns */
  @media (min-width: 1920px) {
    grid-template-columns: repeat(8, minmax(280px, 1fr));
  }

  /* 6 columns on medium-large screens */
  @media (min-width: 1440px) and (max-width: 1919px) {
    grid-template-columns: repeat(6, minmax(280px, 1fr));
  }

  /* 4 columns on desktop */
  @media (min-width: 1024px) and (max-width: 1439px) {
    grid-template-columns: repeat(4, minmax(280px, 1fr));
  }

  /* 2 columns on tablet */
  @media (min-width: 768px) and (max-width: 1023px) {
    grid-template-columns: repeat(2, minmax(280px, 1fr));
  }

  /* 1 column on mobile */
  @media (max-width: 767px) {
    grid-template-columns: 1fr;
  }
}
```

### Virtual Scrolling (For Large Farms)

For farms with 100+ blocks, implement virtual scrolling using `react-window` or `react-virtualized`:

```typescript
import { FixedSizeGrid } from 'react-window';

<FixedSizeGrid
  columnCount={getColumnsPerRow(windowWidth)}
  columnWidth={296}  // 280px + 16px gap
  height={window.innerHeight - 200}
  rowCount={Math.ceil(blocks.length / columnsPerRow)}
  rowHeight={216}    // 200px + 16px gap
  width={window.innerWidth}
>
  {({ columnIndex, rowIndex, style }) => (
    <div style={style}>
      <CompactBlockCard block={blocks[rowIndex * columnsPerRow + columnIndex]} />
    </div>
  )}
</FixedSizeGrid>
```

---

## State-Specific Card Designs

### 1. EMPTY State
```
┌──────────────────────────────────────┐
│ 🏗️ F001-045  [⬜ EMPTY]             │
├──────────────────────────────────────┤
│ 📏 2.5 ha · Max: 250 plants          │
│ ⏱️ Empty for 12 days                 │
│ 🔄 Ready for new planting            │
├──────────────────────────────────────┤
│ [🌱 Plant Crop] [✏️ Edit]           │
└──────────────────────────────────────┘
```

**Data Required:**
- blockCode, name, state
- area, areaUnit, maxPlants
- daysInCurrentState

**Actions:**
- Plant Crop (opens planting modal)
- Edit Block

---

### 2. PLANNED State
```
┌──────────────────────────────────────┐
│ 🏗️ F001-046  [📋 PLANNED]           │
├──────────────────────────────────────┤
│ 🌱 Lettuce Romaine · 200 plants     │
│ 📅 Plant: Nov 25 (in 5 days)         │
│ 🟢 On schedule                       │
├──────────────────────────────────────┤
│ [➡️ Start Planting] [✏️ Edit]       │
└──────────────────────────────────────┘
```

**Data Required:**
- blockCode, name, state
- targetCropName, actualPlantCount
- expectedStatusChanges.planted
- daysUntilNextTransition
- delayDays, isDelayed

**Actions:**
- Start Planting (transition to PLANTED)
- Edit Planning

---

### 3. PLANTED State
```
┌──────────────────────────────────────┐
│ 🏗️ F001-049  [🌱 PLANTED]           │
├──────────────────────────────────────┤
│ 🌱 Tomato Roma · 98/100 (98%)       │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░ 98%           │
├──────────────────────────────────────┤
│ 📅 Planted: Nov 15 (5 days ago)     │
│ ⏱️ Days in stage: 5 / 7 expected    │
│ 🟢 On schedule                       │
├──────────────────────────────────────┤
│ 📋 Next: Growing (in 2 days)         │
│ 🌾 Harvest: Jan 13 (59 days)         │
├──────────────────────────────────────┤
│ [➡️ Growing] [👁️ View] [✏️ Edit]   │
└──────────────────────────────────────┘
```

**Data Required:**
- blockCode, name, state
- targetCropName, actualPlantCount, maxPlants, capacityPercent
- plantedDate, daysInCurrentState
- expectedStateChangeDate, daysUntilNextTransition
- delayDays, isDelayed
- expectedHarvestDate

**Actions:**
- Transition to Growing
- View Details
- Edit Block

---

### 4. GROWING State
```
┌──────────────────────────────────────┐
│ 🏗️ F001-050  [🌿 GROWING]           │
├──────────────────────────────────────┤
│ 🌱 Lettuce Romaine · 195/200 (97%)  │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░ 97%           │
├──────────────────────────────────────┤
│ 📅 Planted: Oct 20 (30 days ago)    │
│ ⏱️ Growth progress: 30 / 35 days    │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░ 86%           │
├──────────────────────────────────────┤
│ 📋 Next: Fruiting (in 5 days)        │
│ 🔴 2 days late from schedule         │
├──────────────────────────────────────┤
│ [➡️ Fruiting] [👁️ View] [✏️ Edit]  │
└──────────────────────────────────────┘
```

**Data Required:**
- blockCode, name, state
- targetCropName, actualPlantCount, maxPlants, capacityPercent
- plantedDate, daysInCurrentState
- expectedStateChangeDate, daysUntilNextTransition
- delayDays, isDelayed
- Growth stage duration (from plant data)

**Actions:**
- Transition to Fruiting
- View Details
- Edit Block

---

### 5. FRUITING State
```
┌──────────────────────────────────────┐
│ 🏗️ F001-051  [🍎 FRUITING]          │
├──────────────────────────────────────┤
│ 🌱 Strawberry · 180/200 (90%)       │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░ 90%           │
├──────────────────────────────────────┤
│ 📅 Fruiting started: Nov 10          │
│ ⏱️ Fruit development: 10 / 21 days   │
│ ▓▓▓▓▓▓▓▓▓░░░░░░░░░░ 48%           │
├──────────────────────────────────────┤
│ 📋 Next: Harvesting (in 11 days)     │
│ 🟢 1 day early - excellent!          │
├──────────────────────────────────────┤
│ [➡️ Harvest] [👁️ View] [✏️ Edit]   │
└──────────────────────────────────────┘
```

**Data Required:**
- blockCode, name, state
- targetCropName, actualPlantCount, maxPlants, capacityPercent
- Fruiting start date, daysInCurrentState
- expectedStateChangeDate, daysUntilNextTransition
- delayDays, isDelayed
- Fruiting stage duration (from plant data)

**Actions:**
- Transition to Harvesting
- View Details
- Edit Block

---

### 6. HARVESTING State
```
┌──────────────────────────────────────┐
│ 🏗️ F001-047  [🌾 HARVESTING]  🎯✨  │
├──────────────────────────────────────┤
│ 🌱 Strawberry · 180/200 (90%)       │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░ 90%           │
├──────────────────────────────────────┤
│ 📊 1850 / 600 kg (308%) 🎯          │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ 308%          │
│ 🏆 Efficiency: EXCEPTIONAL           │
├──────────────────────────────────────┤
│ 📅 7 harvests · Last: 2 days ago     │
│ 📋 Estimated final: 2400 kg          │
├──────────────────────────────────────┤
│ [✂️ Record Harvest] [👁️ View]      │
└──────────────────────────────────────┘
```

**Data Required:**
- blockCode, name, state
- targetCropName, actualPlantCount, maxPlants, capacityPercent
- kpi.predictedYieldKg, kpi.actualYieldKg, kpi.yieldEfficiencyPercent
- kpi.totalHarvests
- calculated.yieldProgress, calculated.performanceCategory
- calculated.estimatedFinalYield

**Performance Indicators:**
- 🎯 = Exceeding (100-199%)
- ✨ = Exceptional (200%+)
- 🏆 = Performance badge

**Actions:**
- Record Harvest
- View Details

---

### 7. CLEANING State
```
┌──────────────────────────────────────┐
│ 🏗️ F001-052  [🧹 CLEANING]          │
├──────────────────────────────────────┤
│ 🧹 Cleaning in progress              │
│ ⏱️ Days in cleaning: 2 days          │
├──────────────────────────────────────┤
│ 📊 Last Cycle Summary:               │
│ 🌱 Tomato · 450kg / 500kg (90%)     │
│ 🏆 Excellent performance             │
│ 📅 Emptied: Nov 18                   │
├──────────────────────────────────────┤
│ 📋 Ready for new planting            │
│ [➡️ Empty] [📊 View Cycle]          │
└──────────────────────────────────────┘
```

**Data Required:**
- blockCode, name, state
- daysInCurrentState
- Last cycle data (from most recent archive or cached data)

**Actions:**
- Mark as Empty (creates archive)
- View Cycle History

---

### 8. ALERT State
```
┌──────────────────────────────────────┐
│ ⚠️ F001-048  [🚨 ALERT - CRITICAL]  │
├──────────────────────────────────────┤
│ 🌡️ Temperature Critical: 38°C       │
│ ⚡ IMMEDIATE ACTION REQUIRED          │
├──────────────────────────────────────┤
│ 🌱 Tomato · Planted 25 days ago     │
│ 📋 Previous state: GROWING           │
├──────────────────────────────────────┤
│ [🔧 View Alert] [✅ Resolve]        │
└──────────────────────────────────────┘
```

**Alert Severity Variations:**
- **CRITICAL**: Red pulsing border, red background tint
- **HIGH**: Orange border, orange background tint
- **MEDIUM**: Yellow border, yellow background tint
- **LOW**: Light yellow border

**Data Required:**
- blockCode, name, state
- activeAlerts (severity, title)
- previousState
- Basic planting info if applicable

**Actions:**
- View Alert Details
- Resolve Alert

---

## Offset Tracking System

### Enhanced StatusChange Model

```python
class StatusChange(BaseModel):
    """Enhanced status change with offset tracking"""

    # Existing fields
    status: BlockStatus
    changedAt: datetime
    changedBy: UUID
    changedByEmail: str
    notes: Optional[str]

    # NEW: Offset tracking fields
    expectedDate: Optional[datetime] = Field(
        None,
        description="Expected date for this transition from planting timeline"
    )
    offsetDays: Optional[int] = Field(
        None,
        description="Actual - Expected in days (negative = early, positive = late)"
    )
    offsetType: Optional[Literal["early", "on_time", "late"]] = Field(
        None,
        description="Categorization of offset"
    )

    # Computed property
    @property
    def offset_description(self) -> str:
        """Human-readable offset description"""
        if self.offsetDays is None:
            return "No timeline set"
        elif self.offsetDays == 0:
            return "On schedule"
        elif self.offsetDays < 0:
            return f"{abs(self.offsetDays)} days early"
        else:
            return f"{self.offsetDays} days late"
```

### Transition Recording Logic

```python
async def transition_block_state(
    block_id: UUID,
    new_state: BlockStatus,
    user_id: UUID,
    user_email: str,
    notes: Optional[str] = None
) -> Block:
    """
    Transition block to new state with offset tracking
    """
    block = await BlockRepository.get_by_id(block_id)
    current_date = datetime.utcnow()

    # Get expected date for this transition
    expected_date = block.expectedStatusChanges.get(new_state.value)

    # Calculate offset
    offset_days = None
    offset_type = None
    auto_notes = []

    if expected_date:
        offset_days = (current_date.date() - expected_date.date()).days

        if offset_days < 0:
            offset_type = "early"
            auto_notes.append(f"Transitioned {abs(offset_days)} days early")
        elif offset_days == 0:
            offset_type = "on_time"
            auto_notes.append("Transitioned on schedule")
        else:
            offset_type = "late"
            auto_notes.append(f"Transitioned {offset_days} days late")

    # Combine user notes with auto-generated notes
    final_notes = " | ".join(filter(None, [*auto_notes, notes]))

    # Create status change record
    status_change = StatusChange(
        status=new_state,
        changedAt=current_date,
        changedBy=user_id,
        changedByEmail=user_email,
        expectedDate=expected_date,
        offsetDays=offset_days,
        offsetType=offset_type,
        notes=final_notes
    )

    # Update block
    block.state = new_state
    block.statusChanges.append(status_change)
    block.updatedAt = current_date

    await BlockRepository.update(block)

    logger.info(
        f"Block {block.blockCode} transitioned to {new_state} "
        f"(offset: {offset_days} days {offset_type if offset_type else 'unknown'})"
    )

    return block
```

### Dashboard Display Logic

```typescript
// TimelineIndicator.tsx
interface TimelineIndicatorProps {
  delayDays: number | null;
  isDelayed: boolean;
  config: DashboardConfig;
}

export function TimelineIndicator({ delayDays, isDelayed, config }: TimelineIndicatorProps) {
  if (delayDays === null) {
    return <NoBadge>No timeline</NoBadge>;
  }

  // Early
  if (delayDays < 0) {
    const days = Math.abs(delayDays);
    return (
      <EarlyBadge color={config.colorScheme.timelinessColors.early}>
        🟢 {days}d early
      </EarlyBadge>
    );
  }

  // On time
  if (delayDays === 0) {
    return (
      <OnTimeBadge color={config.colorScheme.timelinessColors.onTime}>
        ✅ On schedule
      </OnTimeBadge>
    );
  }

  // Slightly late (1-3 days)
  if (delayDays <= 3) {
    return (
      <SlightlyLateBadge color={config.colorScheme.timelinessColors.slightlyLate}>
        🟡 {delayDays}d late
      </SlightlyLateBadge>
    );
  }

  // Late (4-7 days)
  if (delayDays <= 7) {
    return (
      <LateBadge color={config.colorScheme.timelinessColors.late}>
        🟠 {delayDays}d late
      </LateBadge>
    );
  }

  // Very late (8+ days)
  return (
    <VeryLateBadge color={config.colorScheme.timelinessColors.veryLate}>
      🔴 {delayDays}d late
    </VeryLateBadge>
  );
}
```

---

## Harvest Variance Tracking

### Performance Categories

```python
class PerformanceCategory(str, Enum):
    """Yield performance categorization"""
    EXCEPTIONAL = "exceptional"  # >= 200%
    EXCEEDING = "exceeding"      # 100-199%
    EXCELLENT = "excellent"      # 90-99%
    GOOD = "good"                # 70-89%
    ACCEPTABLE = "acceptable"    # 50-69%
    POOR = "poor"                # < 50%
```

### Enhanced BlockKPI Model

```python
class BlockKPI(BaseModel):
    """Enhanced KPI with performance categorization"""

    predictedYieldKg: float = Field(0.0, ge=0)
    actualYieldKg: float = Field(0.0, ge=0)
    yieldEfficiencyPercent: float = Field(0.0, ge=0, le=1000)  # Allow up to 1000%
    totalHarvests: int = Field(0, ge=0)

    @property
    def performance_category(self) -> PerformanceCategory:
        """Categorize performance based on efficiency"""
        if self.yieldEfficiencyPercent >= 200:
            return PerformanceCategory.EXCEPTIONAL
        elif self.yieldEfficiencyPercent >= 100:
            return PerformanceCategory.EXCEEDING
        elif self.yieldEfficiencyPercent >= 90:
            return PerformanceCategory.EXCELLENT
        elif self.yieldEfficiencyPercent >= 70:
            return PerformanceCategory.GOOD
        elif self.yieldEfficiencyPercent >= 50:
            return PerformanceCategory.ACCEPTABLE
        else:
            return PerformanceCategory.POOR

    @property
    def performance_icon(self) -> str:
        """Get icon for performance category"""
        icons = {
            PerformanceCategory.EXCEPTIONAL: "🏆",
            PerformanceCategory.EXCEEDING: "🎯",
            PerformanceCategory.EXCELLENT: "⭐",
            PerformanceCategory.GOOD: "✅",
            PerformanceCategory.ACCEPTABLE: "🟡",
            PerformanceCategory.POOR: "🔴"
        }
        return icons[self.performance_category]

    @property
    def performance_label(self) -> str:
        """Get human-readable label"""
        return self.performance_category.value.upper()
```

### Harvest Recording with Alerts

```python
async def record_harvest(
    block_id: UUID,
    quantity_kg: float,
    quality_grade: Literal["A", "B", "C"],
    user_id: UUID,
    user_email: str,
    notes: Optional[str] = None
) -> tuple[BlockHarvest, list[dict]]:
    """
    Record harvest and return alerts for exceptional performance
    """
    block = await BlockRepository.get_by_id(block_id)

    # Validate block is in harvesting state
    if block.state != BlockStatus.HARVESTING:
        raise HTTPException(
            400,
            f"Block must be in HARVESTING state (current: {block.state})"
        )

    # Create harvest record
    harvest = BlockHarvest(
        harvestId=uuid4(),
        blockId=block_id,
        farmId=block.farmId,
        plantingId=block.currentPlantingId,
        harvestDate=datetime.utcnow(),
        quantityKg=quantity_kg,
        unit="kg",
        qualityGrade=quality_grade,
        harvestedBy=user_id,
        harvestedByEmail=user_email,
        notes=notes
    )

    await HarvestRepository.create(harvest)

    # Update block KPI
    new_actual_yield = block.kpi.actualYieldKg + quantity_kg
    new_efficiency = (
        (new_actual_yield / block.kpi.predictedYieldKg * 100)
        if block.kpi.predictedYieldKg > 0
        else 0
    )
    new_harvest_count = block.kpi.totalHarvests + 1

    # Update block
    block.kpi.actualYieldKg = new_actual_yield
    block.kpi.yieldEfficiencyPercent = new_efficiency
    block.kpi.totalHarvests = new_harvest_count

    await BlockRepository.update(block)

    # Generate alerts for exceptional performance
    alerts = []

    # Alert: Exceeding 200%
    if new_efficiency >= 200:
        alerts.append({
            "type": "exceptional_yield",
            "severity": "info",
            "message": f"🏆 Block {block.blockCode} has exceptional yield! "
                      f"{new_efficiency:.0f}% of predicted ({new_actual_yield:.1f}kg / {block.kpi.predictedYieldKg:.1f}kg)",
            "blockId": str(block_id),
            "blockCode": block.blockCode
        })

    # Alert: First time exceeding 100%
    if new_efficiency >= 100 and (new_efficiency - (quantity_kg / block.kpi.predictedYieldKg * 100)) < 100:
        alerts.append({
            "type": "target_exceeded",
            "severity": "success",
            "message": f"🎯 Block {block.blockCode} has exceeded predicted yield! "
                      f"{new_efficiency:.0f}%",
            "blockId": str(block_id),
            "blockCode": block.blockCode
        })

    logger.info(
        f"Harvest recorded for block {block.blockCode}: "
        f"{quantity_kg}kg (grade {quality_grade}), "
        f"new efficiency: {new_efficiency:.1f}%"
    )

    return harvest, alerts
```

### Dashboard Progress Bar Component

```typescript
// HarvestProgressBar.tsx
interface HarvestProgressBarProps {
  predictedYieldKg: number;
  actualYieldKg: number;
  yieldEfficiencyPercent: number;
  performanceCategory: string;
  config: DashboardConfig;
}

export function HarvestProgressBar({
  predictedYieldKg,
  actualYieldKg,
  yieldEfficiencyPercent,
  performanceCategory,
  config
}: HarvestProgressBarProps) {
  // Cap visual display at 400% to prevent overflow
  const visualPercent = Math.min(yieldEfficiencyPercent, 400);

  const performanceColor = config.colorScheme.performanceColors[
    performanceCategory as keyof typeof config.colorScheme.performanceColors
  ];

  return (
    <Container>
      <Label>
        📊 {actualYieldKg.toFixed(1)} / {predictedYieldKg.toFixed(1)} kg
        ({yieldEfficiencyPercent.toFixed(0)}%)
        {getPerformanceIcon(performanceCategory)}
      </Label>

      <ProgressBarContainer>
        {/* Main progress bar */}
        <ProgressBar
          percent={visualPercent / 4}  // Scale to 0-100% range
          color={performanceColor}
          animated={true}
        />

        {/* Reference lines */}
        <ReferenceLine position="25%" label="100%" />

        {yieldEfficiencyPercent >= 200 && (
          <ReferenceLine position="50%" label="200%" />
        )}

        {yieldEfficiencyPercent >= 300 && (
          <ReferenceLine position="75%" label="300%" />
        )}

        {yieldEfficiencyPercent >= 400 && (
          <MaxIndicator>400%+</MaxIndicator>
        )}
      </ProgressBarContainer>

      {/* Performance badge */}
      <PerformanceBadge
        category={performanceCategory}
        color={performanceColor}
      >
        {performanceCategory.toUpperCase()}
      </PerformanceBadge>
    </Container>
  );
}
```

---

## Historical Analysis

### Enhanced BlockArchive Model

```python
class BlockArchive(BaseModel):
    """Enhanced archive with detailed performance metrics"""

    # ... existing fields ...

    # ENHANCED: Detailed performance tracking
    performanceMetrics: dict = Field(
        default_factory=dict,
        description="Comprehensive performance analysis"
    )

    # Structure of performanceMetrics:
    # {
    #   "yieldVariance": {
    #     "predicted": 500.0,
    #     "actual": 1540.0,
    #     "variance_kg": 1040.0,
    #     "variance_percent": 208.0,
    #     "category": "exceptional"
    #   },
    #
    #   "timelineVariance": {
    #     "planted": {
    #       "expected": "2025-10-15",
    #       "actual": "2025-10-13",
    #       "offset_days": -2,
    #       "status": "early"
    #     },
    #     "growing": {...},
    #     "fruiting": {...},
    #     "harvesting": {...},
    #     "emptied": {...}
    #   },
    #
    #   "harvestDetails": {
    #     "total_harvests": 12,
    #     "avg_per_harvest_kg": 128.3,
    #     "harvest_frequency_days": 3.5,
    #     "quality_distribution": {
    #       "A": 70.0,  # percentage
    #       "B": 25.0,
    #       "C": 5.0
    #     },
    #     "best_harvest": {
    #       "amount": 185.0,
    #       "date": "2025-11-05",
    #       "grade": "A"
    #     },
    #     "worst_harvest": {
    #       "amount": 95.0,
    #       "date": "2025-11-22",
    #       "grade": "C"
    #     }
    #   },
    #
    #   "cycleEfficiency": {
    #     "total_cycle_days": 95,
    #     "expected_cycle_days": 90,
    #     "efficiency_percent": 94.7,  # expected/actual * 100
    #     "days_variance": 5
    #   }
    # }
```

### Archive Creation Logic

```python
async def create_archive_from_block(block: Block) -> BlockArchive:
    """
    Create comprehensive archive when transitioning from CLEANING to EMPTY
    """
    # Fetch all harvests for this cycle
    harvests = await HarvestRepository.get_by_planting(block.currentPlantingId)

    # Calculate harvest details
    harvest_details = calculate_harvest_details(harvests)

    # Calculate timeline variance from status changes
    timeline_variance = {}
    for change in block.statusChanges:
        if change.expectedDate and change.offsetDays is not None:
            timeline_variance[change.status.value] = {
                "expected": change.expectedDate.isoformat(),
                "actual": change.changedAt.isoformat(),
                "offset_days": change.offsetDays,
                "status": change.offsetType
            }

    # Calculate cycle efficiency
    first_planted = next(
        (c for c in block.statusChanges if c.status == BlockStatus.PLANTED),
        None
    )
    last_cleaned = next(
        (c for c in reversed(block.statusChanges) if c.status == BlockStatus.CLEANING),
        None
    )

    actual_cycle_days = 0
    expected_cycle_days = 0

    if first_planted and last_cleaned:
        actual_cycle_days = (last_cleaned.changedAt - first_planted.changedAt).days
        # Get expected from plant data
        plant_data = await PlantDataRepository.get_by_id(block.targetCrop)
        if plant_data:
            expected_cycle_days = plant_data.growthCycle.totalCycleDays

    cycle_efficiency = (
        (expected_cycle_days / actual_cycle_days * 100)
        if actual_cycle_days > 0
        else 0
    )

    # Create archive
    archive = BlockArchive(
        archiveId=uuid4(),
        blockId=block.blockId,
        farmId=block.farmId,
        plantingId=block.currentPlantingId,
        plantDataId=block.targetCrop,
        plantName=block.targetCropName,

        # Dates
        plantedDate=block.plantedDate,
        harvestStartDate=harvests[0].harvestDate if harvests else None,
        harvestEndDate=harvests[-1].harvestDate if harvests else None,
        cycleDuration=actual_cycle_days,

        # Yield
        predictedYield={
            "amount": block.kpi.predictedYieldKg,
            "unit": "kg"
        },
        actualYield={
            "amount": block.kpi.actualYieldKg,
            "unit": "kg"
        },
        yieldEfficiency=block.kpi.yieldEfficiencyPercent,

        # Quality distribution
        qualityBreakdown=harvest_details["quality_distribution"],

        # Harvests
        harvests=[h.dict() for h in harvests],

        # Status history
        statusChanges=[c.dict() for c in block.statusChanges],

        # ENHANCED: Performance metrics
        performanceMetrics={
            "yieldVariance": {
                "predicted": block.kpi.predictedYieldKg,
                "actual": block.kpi.actualYieldKg,
                "variance_kg": block.kpi.actualYieldKg - block.kpi.predictedYieldKg,
                "variance_percent": block.kpi.yieldEfficiencyPercent,
                "category": block.kpi.performance_category.value
            },
            "timelineVariance": timeline_variance,
            "harvestDetails": harvest_details,
            "cycleEfficiency": {
                "total_cycle_days": actual_cycle_days,
                "expected_cycle_days": expected_cycle_days,
                "efficiency_percent": cycle_efficiency,
                "days_variance": actual_cycle_days - expected_cycle_days
            }
        },

        # Audit
        archivedAt=datetime.utcnow(),
        archivedBy=user_id,
        archivedByEmail=user_email
    )

    await ArchiveRepository.create(archive)

    logger.info(
        f"Created archive for block {block.blockCode}: "
        f"yield {block.kpi.yieldEfficiencyPercent:.1f}%, "
        f"cycle {cycle_efficiency:.1f}% efficient"
    )

    return archive
```

### Analytics Query Examples

```python
# 1. Best performing crop in last year
async def get_best_performing_crop(farm_id: UUID) -> dict:
    """Find crop with highest average yield variance"""

    archives = await ArchiveRepository.get_by_farm(
        farm_id,
        start_date=datetime.utcnow() - timedelta(days=365)
    )

    crop_stats = {}

    for archive in archives:
        crop_id = str(archive.plantDataId)

        if crop_id not in crop_stats:
            crop_stats[crop_id] = {
                "crop_name": archive.plantName,
                "cycles": 0,
                "total_yield_variance": 0,
                "total_timeline_efficiency": 0
            }

        metrics = archive.performanceMetrics
        crop_stats[crop_id]["cycles"] += 1
        crop_stats[crop_id]["total_yield_variance"] += metrics["yieldVariance"]["variance_percent"]

        # Calculate average timeline offset (negative = ahead of schedule = good)
        timeline_offsets = [
            v["offset_days"]
            for v in metrics["timelineVariance"].values()
            if v.get("offset_days") is not None
        ]

        avg_offset = sum(timeline_offsets) / len(timeline_offsets) if timeline_offsets else 0
        crop_stats[crop_id]["total_timeline_efficiency"] += (0 - avg_offset)

    # Calculate averages and sort
    results = []
    for crop_id, stats in crop_stats.items():
        results.append({
            "crop_id": crop_id,
            "crop_name": stats["crop_name"],
            "cycles": stats["cycles"],
            "avg_yield_variance": stats["total_yield_variance"] / stats["cycles"],
            "avg_timeline_efficiency": stats["total_timeline_efficiency"] / stats["cycles"]
        })

    # Sort by combined score
    results.sort(
        key=lambda x: x["avg_yield_variance"] + x["avg_timeline_efficiency"],
        reverse=True
    )

    return results[0] if results else None


# 2. Block performance trends over time
async def get_block_performance_trends(
    block_id: UUID,
    months: int = 6
) -> dict:
    """Analyze performance trends for a specific block"""

    archives = await ArchiveRepository.get_by_block(
        block_id,
        start_date=datetime.utcnow() - timedelta(days=months * 30)
    )

    # Sort by date
    archives.sort(key=lambda x: x.archivedAt)

    timeline = []
    for archive in archives:
        metrics = archive.performanceMetrics

        timeline.append({
            "cycle_end": archive.archivedAt.isoformat(),
            "crop": archive.plantName,
            "yield_efficiency": metrics["yieldVariance"]["variance_percent"],
            "timeline_efficiency": metrics["cycleEfficiency"]["efficiency_percent"],
            "quality_a_percent": metrics["harvestDetails"]["quality_distribution"]["A"]
        })

    # Calculate trend
    if len(timeline) >= 2:
        first_efficiency = timeline[0]["yield_efficiency"]
        last_efficiency = timeline[-1]["yield_efficiency"]
        trend_percent = ((last_efficiency - first_efficiency) / first_efficiency * 100)
        trend_direction = "improving" if trend_percent > 5 else "declining" if trend_percent < -5 else "stable"
    else:
        trend_percent = 0
        trend_direction = "insufficient_data"

    return {
        "timeline": timeline,
        "trend": {
            "direction": trend_direction,
            "percent_change": trend_percent
        },
        "avg_yield_efficiency": sum(t["yield_efficiency"] for t in timeline) / len(timeline) if timeline else 0,
        "avg_timeline_efficiency": sum(t["timeline_efficiency"] for t in timeline) / len(timeline) if timeline else 0
    }
```

---

## Component Structure

### Directory Layout

```
src/
├── pages/
│   └── farm/
│       └── FarmDashboardPage.tsx          # Main dashboard page
│
├── components/
│   └── farm/
│       └── dashboard/
│           ├── FarmSelector.tsx           # Farm dropdown with search
│           ├── DashboardHeader.tsx        # Farm info + summary stats
│           ├── DashboardFilters.tsx       # State/type/crop/performance filters
│           ├── DashboardControls.tsx      # Sort, search, view options
│           ├── DashboardSettings.tsx      # Configuration modal
│           ├── BlockGrid.tsx              # Grid layout with virtualization
│           ├── CompactBlockCard.tsx       # Main block card component
│           │   ├── BlockHeader.tsx        # Code, name, state badge
│           │   ├── PlantInfo.tsx          # Plant name, capacity
│           │   ├── CapacityBar.tsx        # Visual capacity indicator
│           │   ├── HarvestProgress.tsx    # Yield progress (harvesting)
│           │   ├── TimelineIndicator.tsx  # Early/late badges
│           │   ├── StateTimeline.tsx      # Expected dates
│           │   └── QuickActions.tsx       # Action buttons
│           ├── UpcomingEvents.tsx         # Next 7 days timeline
│           └── PerformanceBadge.tsx       # Efficiency category badge
│
├── hooks/
│   └── farm/
│       ├── useDashboardData.ts            # Fetch & cache dashboard data
│       ├── useDashboardConfig.ts          # Load/save configuration
│       ├── useBlockActions.ts             # Quick transition/harvest
│       └── useDashboardFilters.ts         # Filter & sort logic
│
├── services/
│   └── farmApi.ts
│       └── getDashboardData()             # API call
│
└── types/
    └── farm.ts
        └── DashboardData interface
```

### Key Component Interfaces

```typescript
// types/farm.ts

export interface DashboardData {
  farmInfo: FarmInfo;
  summary: DashboardSummary;
  blocks: DashboardBlock[];
  recentActivity: Activity[];
  upcomingEvents: UpcomingEvent[];
}

export interface DashboardBlock {
  // Core
  blockId: string;
  blockCode: string;
  name: string;
  state: BlockState;
  blockType: string;

  // Planting
  targetCrop: string | null;
  targetCropName: string | null;
  actualPlantCount: number;
  maxPlants: number;

  // Dates
  plantedDate: string | null;
  expectedHarvestDate: string | null;
  expectedStatusChanges: Record<BlockState, string>;

  // KPI
  kpi: BlockKPI;

  // Calculated
  calculated: {
    daysInCurrentState: number;
    expectedStateChangeDate: string | null;
    daysUntilNextTransition: number | null;
    isDelayed: boolean;
    delayDays: number;
    capacityPercent: number;
    yieldProgress: number;
    yieldStatus: "on_track" | "ahead" | "behind";
    estimatedFinalYield: number;
    performanceCategory: PerformanceCategory;
    nextAction: string;
    nextActionDate: string | null;
  };

  // Alerts
  activeAlerts: Alert[];
}

export type PerformanceCategory =
  | "exceptional"
  | "exceeding"
  | "excellent"
  | "good"
  | "acceptable"
  | "poor";
```

---

## API Endpoints

### Dashboard Endpoint

```python
# GET /api/v1/farm/farms/{farmId}/dashboard

@router.get(
    "/farms/{farmId}/dashboard",
    response_model=DashboardResponse,
    summary="Get farm dashboard data",
    description="Get comprehensive dashboard data for a specific farm with all blocks and calculated metrics"
)
async def get_farm_dashboard(
    farmId: UUID,
    current_user: dict = Depends(get_current_user)
):
    """
    Get complete dashboard data for a farm

    Returns:
    - Farm metadata
    - Summary statistics
    - All blocks with calculated fields
    - Recent activity
    - Upcoming events
    """
    # Verify farm access
    farm = await FarmRepository.get_by_id(farmId)
    if not farm:
        raise HTTPException(404, "Farm not found")

    # Get all blocks for farm
    blocks, total = await BlockRepository.get_by_farm(farmId, skip=0, limit=1000)

    # Calculate summary statistics
    summary = calculate_farm_summary(blocks)

    # Enhance blocks with calculated fields
    dashboard_blocks = []
    for block in blocks:
        calculated = await calculate_block_metrics(block)
        dashboard_blocks.append({
            **block.dict(),
            "calculated": calculated,
            "activeAlerts": await get_active_alerts(block.blockId)
        })

    # Get recent activity (last 7 days)
    recent_activity = await get_recent_activity(farmId, days=7)

    # Get upcoming events (next 7 days)
    upcoming_events = await get_upcoming_events(farmId, days=7)

    return DashboardResponse(
        farmInfo=farm.dict(),
        summary=summary,
        blocks=dashboard_blocks,
        recentActivity=recent_activity,
        upcomingEvents=upcoming_events
    )


async def calculate_block_metrics(block: Block) -> dict:
    """Calculate all dashboard metrics for a block"""

    now = datetime.utcnow()

    # Days in current state
    last_change = block.statusChanges[-1] if block.statusChanges else None
    days_in_state = (
        (now - last_change.changedAt).days
        if last_change
        else 0
    )

    # Next transition
    expected_next_date = None
    days_until_next = None

    if block.expectedStatusChanges:
        # Find next expected state
        state_order = ["planted", "growing", "fruiting", "harvesting", "cleaning"]
        current_idx = state_order.index(block.state.value) if block.state.value in state_order else -1

        if current_idx >= 0 and current_idx < len(state_order) - 1:
            next_state = state_order[current_idx + 1]
            expected_next_date = block.expectedStatusChanges.get(next_state)

            if expected_next_date:
                days_until_next = (expected_next_date.date() - now.date()).days

    # Delay calculation
    is_delayed = False
    delay_days = 0

    if expected_next_date and days_until_next is not None:
        if days_until_next < 0:
            is_delayed = True
            delay_days = abs(days_until_next)
        elif days_until_next == 0:
            delay_days = 0
        else:
            delay_days = -days_until_next  # Negative = time remaining

    # Capacity
    capacity_percent = (
        (block.actualPlantCount / block.maxPlants * 100)
        if block.maxPlants > 0
        else 0
    )

    # Yield performance (for harvesting)
    yield_progress = 0
    yield_status = "on_track"
    estimated_final_yield = block.kpi.predictedYieldKg

    if block.state == BlockStatus.HARVESTING:
        yield_progress = (
            (block.kpi.actualYieldKg / block.kpi.predictedYieldKg * 100)
            if block.kpi.predictedYieldKg > 0
            else 0
        )

        if yield_progress >= 100:
            yield_status = "ahead"
        elif yield_progress < 70:
            yield_status = "behind"

        # Estimate final yield based on current rate
        if block.kpi.totalHarvests > 0 and block.plantedDate:
            days_harvesting = (now - block.plantedDate).days
            avg_yield_per_day = block.kpi.actualYieldKg / days_harvesting if days_harvesting > 0 else 0

            # Get expected harvest duration from plant data
            plant_data = await PlantDataRepository.get_by_id(block.targetCrop)
            if plant_data:
                total_harvest_days = plant_data.growthCycle.harvestDurationDays
                estimated_final_yield = avg_yield_per_day * total_harvest_days

    # Performance category
    performance_category = get_performance_category(block.kpi.yieldEfficiencyPercent)

    # Next action
    next_action = determine_next_action(block)

    return {
        "daysInCurrentState": days_in_state,
        "expectedStateChangeDate": expected_next_date.isoformat() if expected_next_date else None,
        "daysUntilNextTransition": days_until_next,
        "isDelayed": is_delayed,
        "delayDays": delay_days,
        "capacityPercent": round(capacity_percent, 1),
        "yieldProgress": round(yield_progress, 1),
        "yieldStatus": yield_status,
        "estimatedFinalYield": round(estimated_final_yield, 1),
        "performanceCategory": performance_category,
        "nextAction": next_action,
        "nextActionDate": expected_next_date.isoformat() if expected_next_date else None
    }


def get_performance_category(efficiency: float) -> str:
    """Get performance category from efficiency percentage"""
    if efficiency >= 200:
        return "exceptional"
    elif efficiency >= 100:
        return "exceeding"
    elif efficiency >= 90:
        return "excellent"
    elif efficiency >= 70:
        return "good"
    elif efficiency >= 50:
        return "acceptable"
    else:
        return "poor"


def determine_next_action(block: Block) -> str:
    """Determine recommended next action for block"""
    if block.state == BlockStatus.EMPTY:
        return "plant_crop"
    elif block.state == BlockStatus.PLANNED:
        return "start_planting"
    elif block.state == BlockStatus.PLANTED:
        return "transition_to_growing"
    elif block.state == BlockStatus.GROWING:
        return "transition_to_fruiting"
    elif block.state == BlockStatus.FRUITING:
        return "transition_to_harvesting"
    elif block.state == BlockStatus.HARVESTING:
        return "record_harvest"
    elif block.state == BlockStatus.CLEANING:
        return "mark_empty"
    elif block.state == BlockStatus.ALERT:
        return "resolve_alert"
    else:
        return "view_details"
```

### Quick Action Endpoints

```python
# POST /api/v1/farm/farms/{farmId}/blocks/{blockId}/quick-harvest
@router.post(
    "/farms/{farmId}/blocks/{blockId}/quick-harvest",
    summary="Quick harvest recording",
    description="Record harvest from dashboard without full form"
)
async def quick_harvest(
    farmId: UUID,
    blockId: UUID,
    quantity_kg: float,
    quality_grade: Literal["A", "B", "C"] = "A",
    current_user: dict = Depends(get_current_user)
):
    """Quick harvest recording for dashboard"""
    # Implement harvest logic
    pass


# PATCH /api/v1/farm/farms/{farmId}/blocks/{blockId}/quick-transition
@router.patch(
    "/farms/{farmId}/blocks/{blockId}/quick-transition",
    summary="Quick state transition",
    description="Transition block state from dashboard"
)
async def quick_transition(
    farmId: UUID,
    blockId: UUID,
    new_state: BlockStatus,
    notes: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Quick state transition for dashboard"""
    # Implement transition logic with offset tracking
    pass
```

---

## Implementation Phases

### Phase 1: Backend Foundation (Week 1)
**Goal:** Create dashboard API endpoint with calculated fields

**Tasks:**
1. ✅ Create `/farms/{farmId}/dashboard` endpoint
2. ✅ Implement `calculate_block_metrics()` function
3. ✅ Add offset tracking to StatusChange model
4. ✅ Enhance BlockKPI with performance categories
5. ✅ Add quick action endpoints
6. ✅ Write unit tests for calculations
7. ✅ Test with sample data

**Deliverables:**
- Working API endpoint returning dashboard data
- All calculated fields accurate
- Performance category logic working
- Offset tracking recording properly

---

### Phase 2: Frontend Components (Week 2)
**Goal:** Build dashboard UI with configuration

**Tasks:**
1. ✅ Create DashboardPage component structure
2. ✅ Build FarmSelector dropdown
3. ✅ Implement DashboardSettings modal
4. ✅ Create configuration hooks (localStorage)
5. ✅ Build CompactBlockCard with all state variants
6. ✅ Implement BlockGrid with responsive layout
7. ✅ Add loading states and error handling

**Deliverables:**
- Functional dashboard page
- All 8 state card variants working
- Configuration system saving/loading
- Responsive grid layout

---

### Phase 3: Interactivity & Actions (Week 3)
**Goal:** Add quick actions and real-time updates

**Tasks:**
1. ✅ Implement quick transition actions
2. ✅ Add quick harvest recording
3. ✅ Build filter and sort functionality
4. ✅ Add search capability
5. ✅ Implement auto-refresh (30s)
6. ✅ Add optimistic UI updates
7. ✅ Connect all action buttons

**Deliverables:**
- Quick actions working from dashboard
- Filters and search functional
- Real-time updates enabled
- Smooth UX with optimistic updates

---

### Phase 4: Historical Analysis & Polish (Week 4)
**Goal:** Add analytics and finalize UX

**Tasks:**
1. ✅ Enhance BlockArchive with performanceMetrics
2. ✅ Create archive generation logic
3. ✅ Build analytics query functions
4. ✅ Add upcoming events section
5. ✅ Implement recent activity feed
6. ✅ Add performance comparison tools
7. ✅ Polish animations and transitions
8. ✅ Comprehensive testing
9. ✅ Documentation

**Deliverables:**
- Historical analysis working
- Archive creation automatic
- Analytics queries functional
- Complete UX polish
- Full documentation

---

## Testing Strategy

### Unit Tests
- Block metric calculations
- Performance categorization
- Offset calculation logic
- Archive creation

### Integration Tests
- Dashboard API endpoint
- Filter and sort logic
- Quick action endpoints
- Configuration save/load

### E2E Tests
- Complete dashboard workflow
- Farm selection → Block actions → State updates
- Configuration changes
- Performance under load (100+ blocks)

### Performance Tests
- Dashboard load time (<2s for 100 blocks)
- Virtual scrolling (1000+ blocks)
- Filter performance (<100ms)
- Auto-refresh impact

---

## Success Metrics

### Performance
- ✅ Dashboard loads in <2 seconds (100 blocks)
- ✅ Filters apply in <100ms
- ✅ Smooth scrolling (60fps)
- ✅ Auto-refresh doesn't disrupt UX

### Usability
- ✅ Manager can assess farm status in <30 seconds
- ✅ Quick actions complete in <5 seconds
- ✅ Color coding immediately clear
- ✅ Mobile-friendly (responsive)

### Data Accuracy
- ✅ 100% accurate offset tracking
- ✅ Harvest variance up to 1000% supported
- ✅ All calculations match backend
- ✅ Real-time updates reflect database

---

## Future Enhancements

### Phase 5: Advanced Features
- Drag & drop block reordering
- Bulk actions (select multiple blocks)
- Custom dashboard layouts
- Export to PDF/Excel
- Mobile app version

### Phase 6: Intelligence
- Predictive analytics
- Automated recommendations
- ML-based yield predictions
- Anomaly detection
- Weather integration

### Phase 7: Real-Time
- WebSocket for live updates
- Push notifications
- Real-time collaboration
- Live sensor data integration

---

## Conclusion

This plan provides a comprehensive roadmap for building a high-density, intelligent farm dashboard that tracks performance variance, timeline adherence, and provides actionable insights for farm managers.

**Key Innovations:**
1. 🎯 **Variance Tracking**: Celebrates 200%+ yields, records all offsets
2. ⏱️ **Timeline Intelligence**: Shows early/late status for every transition
3. 🎨 **Full Customization**: Colors, icons, and layout density configurable
4. 📊 **Performance Categories**: 6-tier classification from exceptional to poor
5. 📈 **Historical Learning**: Complete metrics archived for future analysis

**Ready to build!**
