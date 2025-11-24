/**
 * Farm Analytics Type Definitions
 *
 * Types for farm-level analytics data returned from the API.
 */

// ============================================================================
// FARM ANALYTICS TYPES
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

export interface AggregatedMetrics {
  totalBlocks: number;
  activePlantings: number;
  totalYieldKg: number;
  avgYieldEfficiency: number;
  overallPerformanceScore: number;
  totalCapacity: number;
  currentUtilization: number;
  predictedYieldKg: number;
}

export interface StateBreakdownItem {
  count: number;
  blockIds: string[];
  avgDaysInState: number | null;
}

export interface StateBreakdown {
  empty: StateBreakdownItem;
  planned: StateBreakdownItem;
  growing: StateBreakdownItem;
  fruiting: StateBreakdownItem;
  harvesting: StateBreakdownItem;
  cleaning: StateBreakdownItem;
  alert: StateBreakdownItem;
}

export interface BlockComparisonItem {
  blockId: string;
  blockCode: string;
  name: string | null;
  state: string;
  currentCrop: string | null;
  yieldKg: number;
  yieldEfficiency: number;
  performanceScore: number;
  daysInCycle: number | null;
  taskCompletionRate: number;
  activeAlerts: number;
}

export interface YieldTimelinePoint {
  date: string;
  totalYieldKg: number;
  harvestCount: number;
  blockIds: string[];
}

export interface StateTransitionPoint {
  date: string;
  blockId: string;
  blockCode: string;
  fromState: string;
  toState: string;
}

export type PerformanceTrend = 'improving' | 'stable' | 'declining' | 'insufficient_data';

export interface HistoricalTrends {
  yieldTimeline: YieldTimelinePoint[];
  stateTransitions: StateTransitionPoint[];
  performanceTrend: PerformanceTrend;
  avgHarvestsPerWeek: number;
}

export interface FarmAnalyticsData {
  farmId: string;
  farmName: string;
  period: string;
  startDate: string;
  endDate: string;
  generatedAt: string;
  aggregatedMetrics: AggregatedMetrics;
  stateBreakdown: StateBreakdown;
  blockComparison: BlockComparisonItem[];
  historicalTrends: HistoricalTrends;
}
