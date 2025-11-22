/**
 * Operations Task Manager - TypeScript Type Definitions
 *
 * This file contains all type definitions for the Operations Task Manager module,
 * matching the backend API response structures.
 */

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

export const TASK_TYPE_COLORS: Record<TaskType, string> = {
  planting: '#10B981',        // Green
  fruiting_check: '#A855F7',  // Purple
  harvest_readiness: '#F59E0B', // Orange
  daily_harvest: '#F59E0B',   // Orange
  harvest_completion: '#3B82F6', // Blue
  cleaning: '#EF4444',        // Red
  custom: '#6B7280',          // Gray
};

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  planting: 'Planting',
  fruiting_check: 'Fruiting Check',
  harvest_readiness: 'Harvest Readiness',
  daily_harvest: 'Daily Harvest',
  harvest_completion: 'Harvest Completion',
  cleaning: 'Cleaning',
  custom: 'Custom Task',
};

export const TASK_STATUS_COLORS: Record<TaskStatus, string> = {
  pending: '#6B7280',         // Gray
  in_progress: '#3B82F6',     // Blue
  completed: '#10B981',       // Green
  cancelled: '#EF4444',       // Red
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const HARVEST_GRADE_COLORS: Record<HarvestGrade, string> = {
  A: '#10B981',    // Green - Best
  B: '#3B82F6',    // Blue - Good
  C: '#F59E0B',    // Orange - Fair
  D: '#EF4444',    // Red - Poor
  Waste: '#6B7280', // Gray - Waste
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
