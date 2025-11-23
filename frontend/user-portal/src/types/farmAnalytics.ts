/**
 * Farm Analytics Type Definitions
 *
 * Types for farm-level analytics data returned from the API.
 * Aggregates statistics from all blocks in a farm.
 */

import type { TimePeriod } from './analytics';

// ============================================================================
// FARM ANALYTICS TYPES
// ============================================================================

export interface FarmAnalytics {
  farmId: string;
  farmName: string;
  period: TimePeriod;
  startDate: string | null;
  endDate: string | null;
  generatedAt: string;
  aggregatedMetrics: AggregatedMetrics;
  stateBreakdown: StateBreakdown;
  blockComparison: BlockComparisonItem[];
  historicalTrends: HistoricalTrends;
}

// ============================================================================
// AGGREGATED METRICS
// ============================================================================

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

// ============================================================================
// STATE BREAKDOWN
// ============================================================================

export interface StateBreakdown {
  empty: StateInfo;
  planned: StateInfo;
  growing: StateInfo;
  fruiting: StateInfo;
  harvesting: StateInfo;
  cleaning: StateInfo;
  alert: StateInfo;
}

export interface StateInfo {
  count: number;
  blockIds: string[];
  avgDaysInState: number;
}

// ============================================================================
// BLOCK COMPARISON
// ============================================================================

export type BlockState = 'empty' | 'planned' | 'growing' | 'fruiting' | 'harvesting' | 'cleaning' | 'alert';

export interface BlockComparisonItem {
  blockId: string;
  blockCode: string;
  name: string;
  state: BlockState;
  currentCrop: string | null;
  yieldKg: number;
  yieldEfficiency: number;
  performanceScore: number;
  daysInCycle: number;
  taskCompletionRate: number;
  activeAlerts: number;
}

// ============================================================================
// HISTORICAL TRENDS
// ============================================================================

export interface HistoricalTrends {
  yieldTimeline: YieldTimelinePoint[];
  stateTransitions: StateTransition[];
  performanceTrend: 'improving' | 'stable' | 'declining';
  avgHarvestsPerWeek: number;
}

export interface YieldTimelinePoint {
  date: string;
  totalYieldKg: number;
  harvestCount: number;
}

export interface StateTransition {
  date: string;
  blockId: string;
  blockCode: string;
  fromState: BlockState;
  toState: BlockState;
}
