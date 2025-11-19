/**
 * Alert System API Service
 *
 * This service provides all API calls for the alert/issue reporting system.
 * Alerts are nested under /api/v1/farm/farms/{farmId}/blocks/{blockId}/alerts
 */

import { apiClient } from './api';
import type {
  Alert,
  CreateAlertRequest,
  ResolveAlertRequest,
  ListAlertsParams,
  PaginatedAlertsResponse,
  AlertSummary,
} from '../types/alerts';
import type { SuccessResponse } from '../types/api';

// ============================================================================
// ALERT CREATION & MANAGEMENT
// ============================================================================

/**
 * Create a new alert for a block
 */
export async function createAlert(
  farmId: string,
  blockId: string,
  data: CreateAlertRequest,
  changeBlockStatus: boolean = true
): Promise<Alert> {
  const response = await apiClient.post<SuccessResponse<Alert>>(
    `/v1/farm/farms/${farmId}/blocks/${blockId}/alerts`,
    { ...data, blockId }, // Ensure blockId is in the request body
    {
      params: { changeBlockStatus },
    }
  );
  return response.data.data;
}

/**
 * Get a specific alert by ID
 */
export async function getAlert(
  farmId: string,
  blockId: string,
  alertId: string
): Promise<Alert> {
  const response = await apiClient.get<SuccessResponse<Alert>>(
    `/v1/farm/farms/${farmId}/blocks/${blockId}/alerts/${alertId}`
  );
  return response.data.data;
}

/**
 * List alerts for a block with pagination and filters
 */
export async function listBlockAlerts(
  farmId: string,
  blockId: string,
  params?: ListAlertsParams
): Promise<PaginatedAlertsResponse> {
  const response = await apiClient.get<PaginatedAlertsResponse>(
    `/v1/farm/farms/${farmId}/blocks/${blockId}/alerts`,
    {
      params: {
        page: params?.page || 1,
        perPage: params?.perPage || 20,
        status: params?.status,
        severity: params?.severity,
      },
    }
  );
  return response.data;
}

/**
 * Get active alerts for a block
 */
export async function getActiveBlockAlerts(
  farmId: string,
  blockId: string
): Promise<Alert[]> {
  const response = await apiClient.get<SuccessResponse<Alert[]>>(
    `/v1/farm/farms/${farmId}/blocks/${blockId}/alerts/active`
  );
  return response.data.data;
}

/**
 * Get alert summary statistics for a block
 */
export async function getBlockAlertSummary(
  farmId: string,
  blockId: string
): Promise<AlertSummary> {
  const response = await apiClient.get<SuccessResponse<AlertSummary>>(
    `/v1/farm/farms/${farmId}/blocks/${blockId}/alerts/summary`
  );
  return response.data.data;
}

// ============================================================================
// ALERT RESOLUTION
// ============================================================================

/**
 * Resolve an alert with resolution notes
 */
export async function resolveAlert(
  farmId: string,
  blockId: string,
  alertId: string,
  data: ResolveAlertRequest,
  restoreBlockStatus: boolean = true
): Promise<Alert> {
  const response = await apiClient.post<SuccessResponse<Alert>>(
    `/v1/farm/farms/${farmId}/blocks/${blockId}/alerts/${alertId}/resolve`,
    data,
    {
      params: { restoreBlockStatus },
    }
  );
  return response.data.data;
}

/**
 * Dismiss an alert (for false alarms or non-issues)
 */
export async function dismissAlert(
  farmId: string,
  blockId: string,
  alertId: string
): Promise<Alert> {
  const response = await apiClient.post<SuccessResponse<Alert>>(
    `/v1/farm/farms/${farmId}/blocks/${blockId}/alerts/${alertId}/dismiss`
  );
  return response.data.data;
}

/**
 * Delete an alert (manager only)
 */
export async function deleteAlert(
  farmId: string,
  blockId: string,
  alertId: string
): Promise<boolean> {
  const response = await apiClient.delete<SuccessResponse<boolean>>(
    `/v1/farm/farms/${farmId}/blocks/${blockId}/alerts/${alertId}`
  );
  return response.data.data;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Format alert date for display
 */
export function formatAlertDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Get relative time string for alerts (e.g., "2 hours ago")
 */
export function getAlertRelativeTime(dateString: string): string {
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
  return formatAlertDate(dateString);
}

/**
 * Check if alert is urgent (high or critical severity and still active)
 */
export function isAlertUrgent(alert: Alert): boolean {
  return (
    alert.status === 'active' &&
    (alert.severity === 'high' || alert.severity === 'critical')
  );
}

/**
 * Sort alerts by severity (critical first) and then by date (newest first)
 */
export function sortAlertsBySeverity(alerts: Alert[]): Alert[] {
  const severityOrder: Record<string, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  return [...alerts].sort((a, b) => {
    // First sort by severity
    const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (severityDiff !== 0) return severityDiff;

    // Then by date (newest first)
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

// Export all functions as a single object for convenience
export const alertsApi = {
  // CRUD operations
  createAlert,
  getAlert,
  listBlockAlerts,
  getActiveBlockAlerts,
  getBlockAlertSummary,

  // Resolution
  resolveAlert,
  dismissAlert,
  deleteAlert,

  // Utilities
  formatAlertDate,
  getAlertRelativeTime,
  isAlertUrgent,
  sortAlertsBySeverity,
};

export default alertsApi;
