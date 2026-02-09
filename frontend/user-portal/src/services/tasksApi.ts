/**
 * Operations Task Manager API Service
 *
 * This service provides all API calls for the Operations Task Manager module.
 * All endpoints use the /api/v1/farm/tasks base URL.
 */

import { apiClient } from './api';
import type {
  Task,
  TaskWithDetails,
  CreateTaskRequest,
  UpdateTaskRequest,
  CompleteTaskRequest,
  AddHarvestEntryRequest,
  EndHarvestRequest,
  CancelTaskRequest,
  PendingCountResponse,
  TaskListParams,
  FarmTasksParams,
  BlockTasksParams,
  PaginatedTasksResponse,
  HarvestEntry,
  HarvestSummary,
} from '../types/tasks';

// ============================================================================
// TASK ENDPOINTS
// ============================================================================

/**
 * Get pending task count for current user
 */
export async function getPendingTaskCount(): Promise<number> {
  const response = await apiClient.get<{ data: number; message: string }>('/v1/farm/tasks/pending-count');
  return response.data.data;
}

/**
 * Get tasks for current user
 */
export async function getMyTasks(params?: TaskListParams): Promise<PaginatedTasksResponse> {
  const response = await apiClient.get<any>('/v1/farm/tasks/my-tasks', {
    params: {
      farmId: params?.farmId,
      status: params?.status,
      page: params?.page || 1,
      perPage: params?.perPage || 20,
    },
  });

  // Transform backend response format to match frontend expectations
  return {
    items: response.data.data || [],
    total: response.data.meta?.total || 0,
    page: response.data.meta?.page || 1,
    perPage: response.data.meta?.perPage || 20,
    totalPages: response.data.meta?.totalPages || 1,
  };
}

/**
 * Get tasks for a specific farm (paginated)
 */
export async function getFarmTasks(
  farmId: string,
  params?: FarmTasksParams
): Promise<PaginatedTasksResponse> {
  const response = await apiClient.get<any>(`/v1/farm/tasks/farms/${farmId}`, {
    params: {
      page: params?.page || 1,
      perPage: params?.perPage || 20,
      farmingYear: params?.farmingYear,
    },
  });

  return {
    items: response.data.data || [],
    total: response.data.meta?.total || 0,
    page: response.data.meta?.page || 1,
    perPage: response.data.meta?.perPage || 20,
    totalPages: response.data.meta?.totalPages || 1,
  };
}

/**
 * Get tasks for a specific block (paginated)
 */
export async function getBlockTasks(
  blockId: string,
  params?: BlockTasksParams
): Promise<PaginatedTasksResponse> {
  const response = await apiClient.get<any>(`/v1/farm/tasks/blocks/${blockId}`, {
    params: {
      page: params?.page || 1,
      perPage: params?.perPage || 20,
    },
  });

  return {
    items: response.data.data || [],
    total: response.data.meta?.total || 0,
    page: response.data.meta?.page || 1,
    perPage: response.data.meta?.perPage || 20,
    totalPages: response.data.meta?.totalPages || 1,
  };
}

/**
 * Get a specific task by ID
 */
export async function getTask(taskId: string): Promise<TaskWithDetails> {
  const response = await apiClient.get<{ data: TaskWithDetails }>(`/v1/farm/tasks/${taskId}`);
  return response.data.data;
}

/**
 * Create a custom task (manager only)
 */
export async function createTask(data: CreateTaskRequest): Promise<Task> {
  const response = await apiClient.post<{ data: Task }>('/v1/farm/tasks', data);
  return response.data.data;
}

/**
 * Update a task
 */
export async function updateTask(taskId: string, data: UpdateTaskRequest): Promise<Task> {
  const response = await apiClient.put<{ data: Task }>(`/v1/farm/tasks/${taskId}`, data);
  return response.data.data;
}

/**
 * Complete a task
 */
export async function completeTask(taskId: string, data?: CompleteTaskRequest): Promise<Task> {
  const response = await apiClient.post<{ data: Task }>(
    `/v1/farm/tasks/${taskId}/complete`,
    data || {}
  );
  return response.data.data;
}

/**
 * Add harvest entry to daily_harvest task
 */
export async function addHarvestEntry(
  taskId: string,
  data: AddHarvestEntryRequest
): Promise<HarvestEntry> {
  const response = await apiClient.post<{ data: HarvestEntry }>(
    `/v1/farm/tasks/${taskId}/harvest`,
    data
  );
  return response.data.data;
}

/**
 * Get harvest summary for a task
 */
export async function getHarvestSummary(taskId: string): Promise<HarvestSummary> {
  const response = await apiClient.get<{ data: HarvestSummary }>(
    `/v1/farm/tasks/${taskId}/harvest-summary`
  );
  return response.data.data;
}

/**
 * End daily harvest early (manager only)
 */
export async function endHarvest(taskId: string, data?: EndHarvestRequest): Promise<Task> {
  const response = await apiClient.post<{ data: Task }>(
    `/v1/farm/tasks/${taskId}/end-harvest`,
    data || {}
  );
  return response.data.data;
}

/**
 * Cancel a task (manager only)
 */
export async function cancelTask(taskId: string, data?: CancelTaskRequest): Promise<Task> {
  const response = await apiClient.post<{ data: Task }>(
    `/v1/farm/tasks/${taskId}/cancel`,
    data || {}
  );
  return response.data.data;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Format date for API (YYYY-MM-DD)
 */
export function formatDateForAPI(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Format date for display
 */
export function formatDateForDisplay(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Get relative time string (e.g., "2 hours ago")
 */
export function getRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;
  if (diffHour < 24) return `${diffHour} hour${diffHour === 1 ? '' : 's'} ago`;
  if (diffDay < 7) return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
  return formatDateForDisplay(dateString);
}

/**
 * Check if task is overdue
 */
export function isTaskOverdue(dueDate?: string): boolean {
  if (!dueDate) return false;
  const due = new Date(dueDate);
  const now = new Date();
  return due < now;
}

/**
 * Get days until due date
 */
export function getDaysUntilDue(dueDate?: string): number | null {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  const now = new Date();
  const diffMs = due.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return diffDays;
}

/**
 * Calculate total harvest quantity from entries
 */
export function calculateTotalHarvest(entries: HarvestEntry[]): number {
  return entries.reduce((total, entry) => total + entry.quantityKg, 0);
}

/**
 * Group harvest entries by grade
 */
export function groupHarvestByGrade(entries: HarvestEntry[]): Record<string, number> {
  return entries.reduce((acc, entry) => {
    acc[entry.grade] = (acc[entry.grade] || 0) + entry.quantityKg;
    return acc;
  }, {} as Record<string, number>);
}

// Export all functions as a single object for convenience
export const tasksApi = {
  // Task management
  getPendingTaskCount,
  getMyTasks,
  getFarmTasks,
  getBlockTasks,
  getTask,
  createTask,
  updateTask,
  completeTask,
  cancelTask,

  // Harvest management
  addHarvestEntry,
  getHarvestSummary,
  endHarvest,

  // Utilities
  formatDateForAPI,
  formatDateForDisplay,
  getRelativeTime,
  isTaskOverdue,
  getDaysUntilDue,
  calculateTotalHarvest,
  groupHarvestByGrade,
};

export default tasksApi;
