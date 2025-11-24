/**
 * Global Farm Analytics Type Definitions
 *
 * Types for system-wide analytics data aggregated across all farms.
 */

// ============================================================================
// GLOBAL ANALYTICS TYPES
// ============================================================================

export type TimePeriod = '30d' | '90d' | '6m' | '1y' | 'all';

export interface TimePeriodOption {
  value: TimePeriod;
  label: string;
  days?: number;
}

export const TIME_PERIOD_OPTIONS: TimePeriodOption[] = [
  { value: '30d', label: 'Last 30 Days', days: 30 },
  { value: '90d', label: 'Last 90 Days', days: 90 },
  { value: '6m', label: 'Last 6 Months', days: 180 },
  { value: '1y', label: 'Last Year', days: 365 },
  { value: 'all', label: 'All Time' },
];

export interface GlobalAggregatedMetrics {
  totalFarms: number;
  totalBlocks: number;
  totalActivePlantings: number;
  totalYieldKg: number;
  avgYieldEfficiencyAcrossFarms: number;
  avgPerformanceScore: number;
  totalCapacity: number;
  avgUtilization: number;
  totalPredictedYieldKg: number;
}

export interface GlobalStateBreakdown {
  empty: number;
  planned: number;
  growing: number;
  fruiting: number;
  harvesting: number;
  cleaning: number;
  alert: number;
  totalBlocks: number;
}

export interface FarmSummary {
  farmId: string;
  farmName: string;
  totalBlocks: number;
  activePlantings: number;
  totalYieldKg: number;
  avgYieldEfficiency: number;
  overallPerformanceScore: number;
  currentUtilization: number;
}

export interface GlobalYieldTimelinePoint {
  date: string;
  totalYieldKg: number;
  harvestCount: number;
  farmCount: number;
}

export type GlobalPerformanceTrend = 'improving' | 'stable' | 'declining' | 'insufficient_data';

export interface GlobalPerformanceInsights {
  topPerformingFarms: FarmSummary[];
  underPerformingFarms: FarmSummary[];
  farmsNeedingAttention: FarmSummary[];
  overallTrend: GlobalPerformanceTrend;
}

export interface GlobalAnalyticsData {
  period: string;
  startDate: string;
  endDate: string;
  generatedAt: string;
  aggregatedMetrics: GlobalAggregatedMetrics;
  stateBreakdown: GlobalStateBreakdown;
  farmSummaries: FarmSummary[];
  yieldTimeline: GlobalYieldTimelinePoint[];
  performanceInsights: GlobalPerformanceInsights;
}
