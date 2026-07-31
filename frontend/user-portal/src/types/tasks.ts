/**
 * Operations Task Manager - TypeScript Type Definitions
 *
 * This file contains all type definitions for the Operations Task Manager module,
 * matching the backend API response structures.
 */

import { theme } from '@a64core/shared';
import type { PhaseKey } from '@a64core/shared';
import type { LucideIcon } from 'lucide-react';
import {
  Sprout,
  Flower2,
  Search,
  ShoppingBasket,
  Check,
  Sparkles,
  ClipboardList,
  Pause,
  Play,
  X,
} from 'lucide-react';

const c = theme.colors;

// ============================================================================
// ENUMS & CONSTANTS
// ============================================================================

export type TaskType =
  | 'planting'
  | 'fruiting_check'
  | 'harvest_readiness'
  | 'daily_harvest'
  | 'harvest_completion'
  | 'cleaning'
  | 'custom';

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

export type HarvestGrade = 'A' | 'B' | 'C' | 'D' | 'Waste';

// ============================================================================
// TASK TYPES
// ============================================================================

export interface Task {
  taskId: string;
  farmId: string;
  blockId: string;
  taskType: TaskType;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: number;
  assignedTo?: string;
  assignedToName?: string;
  assignedToEmail?: string;
  dueDate?: string;
  scheduledDate?: string;
  completedAt?: string;
  completedBy?: string;
  completedByName?: string;
  completedByEmail?: string;
  completionNotes?: string;
  photoUrls?: string[];
  metadata?: {
    plantingId?: string;
    targetCrop?: string;
    targetCropName?: string;
    plantCount?: number;
    harvestReadiness?: boolean;
    expectedYieldKg?: number;
    [key: string]: unknown;
  };
  triggerStateChange?: string; // Phase 2: Block status to transition to when task is completed
  createdAt: string;
  updatedAt: string;
}

export interface TaskWithDetails extends Task {
  farmName?: string;
  farmCode?: string;
  blockCode?: string;
  blockName?: string;
  // Joined from the task's block at fetch time (see backend
  // TaskRepository._enrich_tasks_with_block_farm). Used by harvest entry modals
  // to show block identity + crop without additional fetches.
  targetCrop?: string;
  targetCropName?: string;
  actualPlantCount?: number;
  expectedYieldKg?: number;
}

// ============================================================================
// HARVEST ENTRY TYPES
// ============================================================================

export interface HarvestEntry {
  entryId: string;
  taskId: string;
  blockId: string;
  quantityKg: number;
  grade: HarvestGrade;
  notes?: string;
  recordedBy: string;
  recordedByName: string;
  recordedByEmail: string;
  timestamp: string;
  createdAt: string;
}

export interface HarvestSummary {
  taskId: string;
  totalQuantityKg: number;
  totalEntries: number;
  gradeBreakdown: {
    A: number;
    B: number;
    C: number;
    D: number;
    Waste: number;
  };
  firstEntryDate?: string;
  lastEntryDate?: string;
}

// ============================================================================
// API REQUEST/RESPONSE TYPES
// ============================================================================

export interface CreateTaskRequest {
  farmId: string;
  blockId: string;
  taskType: 'custom';
  title: string;
  description?: string;
  priority?: number;
  assignedTo?: string;
  dueDate?: string;
  scheduledDate?: string;
}

export interface UpdateTaskRequest {
  title?: string;
  description?: string;
  priority?: number;
  assignedTo?: string;
  dueDate?: string;
  scheduledDate?: string;
  status?: TaskStatus;
}

export interface CompleteTaskRequest {
  notes?: string;
  photoUrls?: string[];
  triggerTransition?: boolean; // Phase 2: Whether to trigger block state transition on completion
}

export interface AddHarvestEntryRequest {
  quantity: number;
  grade: HarvestGrade;
  notes?: string;
}

export interface EndHarvestRequest {
  notes?: string;
}

export interface CancelTaskRequest {
  reason?: string;
}

export interface PendingCountResponse {
  count: number;
}

export interface TaskListParams {
  farmId?: string;
  status?: TaskStatus;
  page?: number;
  perPage?: number;
}

export interface FarmTasksParams {
  page?: number;
  perPage?: number;
  /** Filter by farming year (e.g., 2025 for Aug 2025 - Jul 2026) */
  farmingYear?: number;
}

export interface BlockTasksParams {
  page?: number;
  perPage?: number;
}

// ============================================================================
// PAGINATED RESPONSE TYPES
// ============================================================================

export interface PaginatedTasksResponse {
  items: TaskWithDetails[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

// ============================================================================
// UI STATE TYPES
// ============================================================================

export interface TaskFilters {
  status?: TaskStatus;
  taskType?: TaskType;
  assignedTo?: string;
  search?: string;
}

export interface FarmWithTaskCount {
  farmId: string;
  farmName: string;
  farmCode: string;
  pendingTaskCount: number;
  inProgressTaskCount: number;
}

export interface BlockWithTaskCount {
  blockId: string;
  blockCode: string;
  blockName?: string;
  state: string;
  pendingTaskCount: number;
  inProgressTaskCount: number;
}

// ============================================================================
// FORM TYPES
// ============================================================================

export interface CreateCustomTaskFormData {
  farmId: string;
  blockId: string;
  title: string;
  description?: string;
  priority?: number;
  assignedTo?: string;
  dueDate?: string;
  scheduledDate?: string;
}

export interface CompleteTaskFormData {
  notes: string;
  photoUrls: string[];
}

export interface HarvestEntryFormData {
  quantityKg: number;
  grade: HarvestGrade;
  notes: string;
}

// ============================================================================
// COLOR CONSTANTS
// ============================================================================

// Night Observatory (T-901): these task types each correspond to a point in
// the room/crop lifecycle, so — unlike a generic categorical map — they're
// routed onto colors.phase.* rather than colors.bright.*. `daily_harvest`
// and `harvest_completion` share phase.harvesting deliberately (both are
// literally the harvest phase, same precedent the pre-redesign map already
// used pairing harvest_readiness/daily_harvest). `fruiting_check` previously
// (mis)used the raw gold ramp — moved to phase.fruitingInit, since gold is
// reserved for the literal Harvesting phase (spec §3).
//
// Consolidation pass (T-901 shard NON-UI-CLEANUP): the hex map below is now
// DERIVED from TASK_TYPE_PHASE_KEYS rather than hand-written twice — the
// `PhaseKey` export is what call sites composing `phaseBadge()` (which takes
// a PhaseKey, not a colour string) should use instead of re-deriving a key
// from this hex map.
export const TASK_TYPE_PHASE_KEYS: Record<TaskType, PhaseKey> = {
  planting: 'preparing',
  fruiting_check: 'fruitingInit',
  harvest_readiness: 'fruiting',
  daily_harvest: 'harvesting',
  harvest_completion: 'harvesting',
  cleaning: 'cleaning',
  custom: 'empty',
};

export const TASK_TYPE_COLORS: Record<TaskType, string> = Object.fromEntries(
  (Object.entries(TASK_TYPE_PHASE_KEYS) as Array<[TaskType, PhaseKey]>).map(
    ([type, key]) => [type, c.phase[key]]
  )
) as Record<TaskType, string>;

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  planting: 'Planting',
  fruiting_check: 'Fruiting Check',
  harvest_readiness: 'Harvest Readiness',
  daily_harvest: 'Daily Harvest',
  harvest_completion: 'Harvest Completion',
  cleaning: 'Cleaning',
  custom: 'Custom Task',
};

// Night Observatory (T-901): routed onto colors.phase.* per spec §5.2's
// normative table (pending→fruitingInit, open/in-progress→inoculated,
// closed/completed→resting, cancelled/void→decommissioned).
//
// Consolidation pass: hex derived from TASK_STATUS_PHASE_KEYS (see
// TASK_TYPE_PHASE_KEYS above for the same pattern applied to task type).
export const TASK_STATUS_PHASE_KEYS: Record<TaskStatus, PhaseKey> = {
  pending: 'fruitingInit',
  in_progress: 'inoculated',
  completed: 'resting',
  cancelled: 'decommissioned',
};

export const TASK_STATUS_COLORS: Record<TaskStatus, string> = Object.fromEntries(
  (Object.entries(TASK_STATUS_PHASE_KEYS) as Array<[TaskStatus, PhaseKey]>).map(
    ([status, key]) => [status, c.phase[key]]
  )
) as Record<TaskStatus, string>;

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const HARVEST_GRADE_COLORS: Record<HarvestGrade, string> = {
  A: c.success,          // emerald - Best
  B: c.primary[500],     // lapis - Good
  C: c.warning,          // gold - Fair
  D: c.error,            // terracotta - Poor
  Waste: c.textSecondary, // - Waste
};

export const HARVEST_GRADE_LABELS: Record<HarvestGrade, string> = {
  A: 'Grade A',
  B: 'Grade B',
  C: 'Grade C',
  D: 'Grade D',
  Waste: 'Waste',
};

// ============================================================================
// TASK TYPE ICONS
// ============================================================================

export const TASK_TYPE_ICONS: Record<TaskType, string> = {
  planting: '🌱',
  fruiting_check: '🌸',
  harvest_readiness: '🔍',
  daily_harvest: '🧺',
  harvest_completion: '✅',
  cleaning: '🧹',
  custom: '📋',
};

export const TASK_STATUS_ICONS: Record<TaskStatus, string> = {
  pending: '⏸️',
  in_progress: '▶️',
  completed: '✅',
  cancelled: '❌',
};

// Night Observatory (T-901) lucide-react replacements for TASK_TYPE_ICONS /
// TASK_STATUS_ICONS above (spec §6 removes every icon emoji). The string
// maps are left in place for any consumer this shard could not reach —
// route new/updated consumers (e.g. BlockTaskList.tsx's <TaskTypeIcon>)
// through these component maps instead.
export const TASK_TYPE_ICON_COMPONENTS: Record<TaskType, LucideIcon> = {
  planting: Sprout,
  fruiting_check: Flower2,
  harvest_readiness: Search,
  daily_harvest: ShoppingBasket,
  harvest_completion: Check,
  cleaning: Sparkles,
  custom: ClipboardList,
};

export const TASK_STATUS_ICON_COMPONENTS: Record<TaskStatus, LucideIcon> = {
  pending: Pause,
  in_progress: Play,
  completed: Check,
  cancelled: X,
};
