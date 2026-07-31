/**
 * Alert System Types
 *
 * Type definitions for the issue reporting and alert management system.
 * Matches backend models from farm_manager/models/alert.py
 */

import { theme } from '@a64core/shared';
import type { PhaseKey } from '@a64core/shared';
import type { LucideIcon } from 'lucide-react';
import { Info, AlertTriangle, Flame, Siren, Bell, Check, X } from 'lucide-react';

const c = theme.colors;

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

// Severity is a danger-depth scale, not a lifecycle status (spec §5.2
// doesn't cover it) — kept on the success/warning/error family + terracotta
// ramp depth, same technique as AQI_CATEGORY_COLORS in src/types/farm.ts.
// `medium` uses the frozen `warning` semantic token (gold-b) — the
// sanctioned warning/caution slot (spec §1.1), not a generic gold-ramp use.
export const ALERT_SEVERITY_CONFIG: Record<AlertSeverity, AlertSeverityConfig> = {
  low: {
    label: 'Low',
    color: c.success, // emerald
    icon: 'ℹ️',
  },
  medium: {
    label: 'Medium',
    color: c.warning, // gold-b — sanctioned warning slot
    icon: '⚠️',
  },
  high: {
    label: 'High',
    color: c.error, // coral-b
    icon: '🔥',
  },
  critical: {
    label: 'Critical',
    color: c.terracotta[700], // deepest terracotta — most severe carries the most weight
    icon: '🚨',
  },
};

// Night Observatory (T-901): status vocabulary — routed onto colors.phase.*
// per spec §5.2 (active→inoculated, resolved≈"approved"→fruiting,
// dismissed≈"cancelled/void"→decommissioned).
//
// Consolidation pass (T-901 shard NON-UI-CLEANUP): `color` below is derived
// from ALERT_STATUS_PHASE_KEYS instead of being a third hand-written table.
// Compose with `phaseBadge()` (which takes a PhaseKey, not a colour string)
// via ALERT_STATUS_PHASE_KEYS directly rather than re-deriving a key from
// this config's `color` field.
export const ALERT_STATUS_PHASE_KEYS: Record<AlertStatus, PhaseKey> = {
  active: 'inoculated',
  resolved: 'fruiting',
  dismissed: 'decommissioned',
};

export const ALERT_STATUS_CONFIG: Record<AlertStatus, AlertStatusConfig> = {
  active: {
    label: 'Active',
    color: c.phase[ALERT_STATUS_PHASE_KEYS.active],
    icon: '🔔',
  },
  resolved: {
    label: 'Resolved',
    color: c.phase[ALERT_STATUS_PHASE_KEYS.resolved],
    icon: '✅',
  },
  dismissed: {
    label: 'Dismissed',
    color: c.phase[ALERT_STATUS_PHASE_KEYS.dismissed],
    icon: '❌',
  },
};

// Night Observatory (T-901) lucide-react replacements for the emoji `icon`
// fields above (spec §6). The string fields are left in place for any
// consumer this shard could not reach; no live consumer of either config's
// `icon` field was found in this shard's scope at the time of this pass.
export const ALERT_SEVERITY_ICON_COMPONENTS: Record<AlertSeverity, LucideIcon> = {
  low: Info,
  medium: AlertTriangle,
  high: Flame,
  critical: Siren,
};

export const ALERT_STATUS_ICON_COMPONENTS: Record<AlertStatus, LucideIcon> = {
  active: Bell,
  resolved: Check,
  dismissed: X,
};

export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  manual: 'Manual Report',
  sensor: 'Sensor Alert',
  system: 'System Generated',
};
