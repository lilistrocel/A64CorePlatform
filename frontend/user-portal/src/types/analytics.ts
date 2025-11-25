/**
 * Block Analytics Type Definitions
 *
 * Types for block analytics data returned from the API.
 */

// ============================================================================
// BLOCK ANALYTICS TYPES
// ============================================================================

export interface BlockInfo {
  blockId: string;
  blockCode: string;
  name: string | null;
  farmId: string;
  currentState: string;
  currentCrop: string | null;
  currentCropId: string | null;
  plantedDate: string | null;
  expectedHarvestDate: string | null;
  daysInCurrentCycle: number | null;
}

export interface YieldByQuality {
  A: number;
  B: number;
  C: number;
}

export interface YieldTrendPoint {
  date: string;
  quantityKg: number;
  cumulativeKg: number;
  qualityGrade: string;
}

export interface YieldAnalytics {
  totalYieldKg: number;
  predictedYieldKg: number;
  yieldEfficiencyPercent: number;
  yieldByQuality: YieldByQuality;
  qualityDistribution: YieldByQuality;
  totalHarvests: number;
  avgYieldPerHarvest: number;
  firstHarvestDate: string | null;
  lastHarvestDate: string | null;
  harvestingDuration: number | null;
  yieldTrend: YieldTrendPoint[];
  performanceCategory: string;
}

export interface StateTransition {
  fromState: string;
  toState: string;
  transitionDate: string;
  daysInPreviousState: number | null;
  expectedDate: string | null;
  offsetDays: number | null;
  onTime: boolean | null;
}

export interface TimelineAnalytics {
  daysInEachState: Record<string, number>;
  stateTransitions: StateTransition[];
  currentState: string;
  currentStateDuration: number;
  currentStateStartDate: string | null;
  cycleDuration: number | null;
  expectedCycleDuration: number | null;
  onTimeTransitions: number;
  earlyTransitions: number;
  lateTransitions: number;
  avgOffsetDays: number | null;
}

export interface TaskTypeStats {
  total: number;
  completed: number;
  pending: number;
  overdue: number;
  completionRate: number;
  avgCompletionDelay: number | null;
}

export interface TaskAnalytics {
  totalTasks: number;
  completedTasks: number;
  pendingTasks: number;
  overdueTasks: number;
  completionRate: number;
  avgCompletionDelay: number | null;
  tasksByType: Record<string, TaskTypeStats>;
  recentCompletedTasks: number;
  upcomingTasks: number;
}

export interface PerformanceMetrics {
  yieldEfficiencyPercent: number;
  performanceCategory: string;
  performanceIcon: string;
  avgDelayDays: number | null;
  onTimeRate: number;
  taskCompletionRate: number;
  taskOnTimeRate: number;
  overallScore: number | null;
  trend: 'improving' | 'stable' | 'declining' | 'insufficient_data';
  strengths: string[];
  improvements: string[];
}

export interface AlertAnalytics {
  totalAlerts: number;
  activeAlerts: number;
  resolvedAlerts: number;
  dismissedAlerts: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  avgResolutionTimeHours: number | null;
  fastestResolutionHours: number | null;
  slowestResolutionHours: number | null;
}

export interface BlockAnalytics {
  blockInfo: BlockInfo;
  yieldAnalytics: YieldAnalytics;
  timelineAnalytics: TimelineAnalytics;
  taskAnalytics: TaskAnalytics;
  performanceMetrics: PerformanceMetrics;
  alertAnalytics: AlertAnalytics;
  generatedAt: string;
  period: TimePeriod;
  startDate: string | null;
  endDate: string | null;
}

// ============================================================================
// TIME PERIOD TYPES
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

// ============================================================================
// AI ANALYTICS CHAT TYPES
// ============================================================================

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface QueryInfo {
  collection: string;
  pipeline: Array<Record<string, any>>;
  explanation: string;
}

export interface VisualizationSuggestion {
  type: string;
  title: string;
  x_axis?: string;
  y_axis?: string;
}

export interface ReportInfo {
  summary: string;
  insights: string[];
  statistics: Record<string, any>;
  visualization_suggestions: VisualizationSuggestion[];
  markdown: string;
}

export interface CostInfo {
  query_generation: {
    total_cost_usd: number;
  };
  report_generation: {
    total_cost_usd: number;
  };
  total_cost_usd: number;
}

export interface MetadataInfo {
  execution_time_seconds: number;
  result_count: number;
  cache_hit: boolean;
  cost: CostInfo;
  timestamp: string;
}

export interface AIAnalyticsResponse {
  query: QueryInfo;
  results: Array<any>;
  report: ReportInfo;
  metadata: MetadataInfo;
}

export interface AIAnalyticsChatRequest {
  prompt: string;
  conversation_history?: ConversationMessage[];
  force_refresh?: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  response?: AIAnalyticsResponse;
}
