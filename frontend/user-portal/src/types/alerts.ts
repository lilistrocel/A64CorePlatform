/**
 * Alert System Types
 *
 * Type definitions for the issue reporting and alert management system.
 * Matches backend models from farm_manager/models/alert.py
 */

import { lightTheme } from '@a64core/shared';

const c = lightTheme.colors;

// ============================================================================
// ENUMS
// ============================================================================

export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';

export type AlertStatus = 'active' | 'resolved' | 'dismissed';

export type AlertType = 'manual' | 'sensor' | 'system';

// ============================================================================
// CORE ALERT MODELS
// ============================================================================

/**
 * Complete Alert Model
 */
export interface Alert {
  alertId: string;
  blockId: string;
  farmId: string;

  // Alert details
  alertType: AlertType;
  title: string;
  description: string;
  severity: AlertSeverity;
  status: AlertStatus;
  source?: string | null;

  // Created by
  createdBy: string;
  createdByEmail: string;
  createdAt: string;

  // Resolution
  resolvedBy?: string | null;
  resolvedByEmail?: string | null;
  resolvedAt?: string | null;
  resolutionNotes?: string | null;

  // Sensor data (future)
  sensorData?: Record<string, any> | null;
}

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

/**
 * Request body for creating an alert
 */
export interface CreateAlertRequest {
  blockId: string;
  alertType?: AlertType;
  title: string;
  description: string;
  severity: AlertSeverity;
  source?: string;
}

/**
 * Request body for resolving an alert
 */
export interface ResolveAlertRequest {
  resolutionNotes: string;
}

/**
 * Paginated alert list response
 */
export interface PaginatedAlertsResponse {
  data: Alert[];
  meta: {
    total: number;
    page: number;
    perPage: number;
    totalPages: number;
  };
  message: string;
}

/**
 * Alert summary for a block
 */
export interface AlertSummary {
  totalAlerts: number;
  activeAlerts: number;
  severityBreakdown: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
  statusBreakdown: {
    active: number;
    resolved: number;
    dismissed: number;
  };
}

// ============================================================================
// QUERY PARAMETERS
// ============================================================================

/**
 * Query parameters for listing alerts
 */
export interface ListAlertsParams {
  page?: number;
  perPage?: number;
  status?: AlertStatus;
  severity?: AlertSeverity;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Alert severity configuration for UI display
 */
export interface AlertSeverityConfig {
  label: string;
  color: string;
  icon: string;
}

/**
 * Alert status configuration for UI display
 */
export interface AlertStatusConfig {
  label: string;
  color: string;
  icon: string;
}

// ============================================================================
// UI HELPER CONSTANTS
// ============================================================================

export const ALERT_SEVERITY_CONFIG: Record<AlertSeverity, AlertSeverityConfig> = {
  low: {
    label: 'Low',
    color: c.success, // emerald (was green)
    icon: 'ℹ️',
  },
  medium: {
    label: 'Medium',
    color: c.warning, // gold (was orange)
    icon: '⚠️',
  },
  high: {
    label: 'High',
    color: c.error, // terracotta (was deep orange)
    icon: '🔥',
  },
  critical: {
    label: 'Critical',
    color: c.terracotta[700], // deepest terracotta (was red) — most severe carries the most weight, spec §1
    icon: '🚨',
  },
};

export const ALERT_STATUS_CONFIG: Record<AlertStatus, AlertStatusConfig> = {
  active: {
    label: 'Active',
    color: c.primary[500], // lapis (was blue)
    icon: '🔔',
  },
  resolved: {
    label: 'Resolved',
    color: c.success, // emerald (was green)
    icon: '✅',
  },
  dismissed: {
    label: 'Dismissed',
    color: c.textDisabled, // (was gray)
    icon: '❌',
  },
};

export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  manual: 'Manual Report',
  sensor: 'Sensor Alert',
  system: 'System Generated',
};
