/**
 * CCM Dashboard Page
 *
 * Executive overview across all platform modules.
 * Single-page scrollable layout — no tabs.
 * Data fetched from:
 *   GET /api/v1/dashboard/summary               (module counts)
 *   GET /api/v1/farm/dashboard/summary           (farm analytics — optional, may fail gracefully)
 *   GET /api/v1/farm/config/farming-years-list   (farming year options for KPI chart filter)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import styled, { keyframes } from 'styled-components';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { apiClient } from '../../services/api';
import { useFarmingYearStore } from '../../stores/farmingYear.store';
import { useFarmingYearsList } from '../../hooks/queries/useFarmingYears';

// ============================================================================
// TYPES
// ============================================================================

interface ModuleSummary {
  total: number;
  active: number | null;
  details: Record<string, number> | null;
}

interface DashboardSummary {
  farms: ModuleSummary;
  blocks: ModuleSummary;
  employees: ModuleSummary;
  customers: ModuleSummary;
  orders: ModuleSummary;
  vehicles: ModuleSummary;
  shipments: ModuleSummary;
  campaigns: ModuleSummary;
  users: ModuleSummary;
  lastUpdated: string;
}

interface FarmHarvestByFarm {
  farmId: string;
  farmName: string;
  totalKg: number;
  harvestCount: number;
}

interface FarmBlocksByFarm {
  farmId: string;
  farmName: string;
  totalBlocks: number;
  empty: number;
  planned: number;
  growing: number;
  fruiting: number;
  harvesting: number;
  cleaning: number;
  alert: number;
  partial: number;
}

interface FarmCropBreakdown {
  cropName: string;
  blockCount: number;
  farmId?: string;
  farmName?: string;
}

/**
 * Per-farm yield KPI data from the backend summary endpoint.
 * Powered by the new `yieldByFarm` array added in the backend update.
 */
interface FarmYieldKpi {
  farmId: string;
  farmName: string;
  actualYieldKg: number;
  predictedYieldKg: number;
  efficiencyPercent: number;
}

interface CropYieldKpi {
  cropName: string;
  actualYieldKg: number;
  predictedYieldKg: number;
  efficiencyPercent: number;
  farmId?: string;
  farmName?: string;
}

interface FarmSummaryData {
  overview: {
    totalFarms: number;
    totalBlocks: number;
    activePlantings: number;
    upcomingHarvests: number;
  };
  blocksByState: {
    empty: number;
    planned: number;
    growing: number;
    fruiting: number;
    harvesting: number;
    cleaning: number;
    alert: number;
    partial: number;
  };
  blocksByFarm: FarmBlocksByFarm[];
  harvestSummary: {
    totalHarvestsKg: number;
    harvestsByFarm: FarmHarvestByFarm[];
  };
  recentActivity: {
    recentHarvests: number;
    pendingTasks: number;
    activeAlerts: number;
  };
  cropBreakdown: FarmCropBreakdown[];
  yieldByFarm?: FarmYieldKpi[];
  yieldByCrop?: CropYieldKpi[];
}

interface FarmSummaryResponse {
  success: boolean;
  data: FarmSummaryData;
}

type InsightType = 'success' | 'warning' | 'info' | 'critical';

interface Insight {
  title: string;
  description: string;
  type: InsightType;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const MODULE_COLORS: Record<string, string> = {
  farms: '#10B981',
  blocks: '#3B82F6',
  employees: '#8B5CF6',
  customers: '#F59E0B',
  orders: '#EF4444',
  vehicles: '#6366F1',
  shipments: '#14B8A6',
  campaigns: '#EC4899',
  users: '#64748B',
};

const BLOCK_STATE_COLORS: Record<string, string> = {
  growing: '#10B981',
  harvesting: '#F59E0B',
  planned: '#3B82F6',
  empty: '#9E9E9E',
  cleaning: '#8B5CF6',
  alert: '#EF4444',
  fruiting: '#F97316',
  partial: '#06B6D4',
};

const CROP_PALETTE: string[] = [
  '#10B981',
  '#3B82F6',
  '#F59E0B',
  '#8B5CF6',
  '#EC4899',
  '#14B8A6',
  '#F97316',
  '#06B6D4',
  '#6366F1',
  '#84CC16',
];

// ============================================================================
// HELPERS
// ============================================================================

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function formatKg(n: number): string {
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 1 })} kg`;
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

/**
 * Derive auto-generated insight cards from the available data.
 * Returns at most 6 insights; only includes insights where data is meaningful.
 */
function generateInsights(
  summary: DashboardSummary,
  farm: FarmSummaryData | null
): Insight[] {
  const insights: Insight[] = [];

  if (!farm) return insights;

  const { recentActivity, harvestSummary, blocksByState, overview } = farm;

  // Critical: active alerts
  if (recentActivity.activeAlerts > 0) {
    insights.push({
      title: 'Active Alerts',
      description: `${formatNumber(recentActivity.activeAlerts)} block ${
        recentActivity.activeAlerts === 1 ? 'alert requires' : 'alerts require'
      } immediate attention.`,
      type: 'critical',
    });
  }

  // Total harvest across all farms
  if (harvestSummary.totalHarvestsKg > 0) {
    const farmCount = harvestSummary.harvestsByFarm.filter((f) => f.totalKg > 0).length;
    insights.push({
      title: 'Total Harvest Recorded',
      description: `${formatKg(harvestSummary.totalHarvestsKg)} harvested across ${formatNumber(farmCount)} ${farmCount === 1 ? 'farm' : 'farms'}.`,
      type: 'success',
    });
  }

  // Recent harvest activity
  if (recentActivity.recentHarvests > 0) {
    insights.push({
      title: 'Recent Harvest Activity',
      description: `${formatNumber(recentActivity.recentHarvests)} ${
        recentActivity.recentHarvests === 1 ? 'harvest' : 'harvests'
      } recorded in the last 7 days.`,
      type: 'info',
    });
  }

  // Top performing farm by harvest kg
  if (harvestSummary.harvestsByFarm.length > 0) {
    const topFarm = harvestSummary.harvestsByFarm.reduce((best, current) =>
      current.totalKg > best.totalKg ? current : best
    );
    if (topFarm.totalKg > 0) {
      insights.push({
        title: 'Top Performing Farm',
        description: `${topFarm.farmName} leads with ${formatKg(topFarm.totalKg)} harvested (${formatNumber(topFarm.harvestCount)} ${topFarm.harvestCount === 1 ? 'harvest' : 'harvests'}).`,
        type: 'success',
      });
    }
  }

  // Blocks currently in harvesting phase
  if (blocksByState.harvesting > 0) {
    insights.push({
      title: 'Harvesting In Progress',
      description: `${formatNumber(blocksByState.harvesting)} ${
        blocksByState.harvesting === 1 ? 'block is' : 'blocks are'
      } currently in the harvesting phase.`,
      type: 'warning',
    });
  }

  // Blocks in planned state — ready for planting
  if (blocksByState.planned > 0) {
    insights.push({
      title: 'Blocks Ready for Planting',
      description: `${formatNumber(blocksByState.planned)} ${
        blocksByState.planned === 1 ? 'block is' : 'blocks are'
      } planned and ready for planting assignment.`,
      type: 'info',
    });
  }

  // Capacity utilisation: blocks actively planted vs total
  if (overview.totalBlocks > 0) {
    const activeBlocks =
      (blocksByState.growing ?? 0) +
      (blocksByState.fruiting ?? 0) +
      (blocksByState.harvesting ?? 0);
    const pct = Math.round((activeBlocks / overview.totalBlocks) * 100);
    if (pct > 0) {
      insights.push({
        title: 'Planting Capacity',
        description: `${pct}% of blocks (${formatNumber(activeBlocks)} of ${formatNumber(overview.totalBlocks)}) are actively planted.`,
        type: pct >= 70 ? 'success' : pct >= 40 ? 'info' : 'warning',
      });
    }
  }

  // Pending tasks
  if (recentActivity.pendingTasks > 0) {
    insights.push({
      title: 'Pending Tasks',
      description: `${formatNumber(recentActivity.pendingTasks)} ${
        recentActivity.pendingTasks === 1 ? 'task is' : 'tasks are'
      } pending action.`,
      type: 'warning',
    });
  }

  // Business insights from summary data
  if (
    summary.employees.active !== null &&
    summary.employees.active < summary.employees.total
  ) {
    const inactive = summary.employees.total - summary.employees.active;
    insights.push({
      title: 'Inactive Employees',
      description: `${formatNumber(inactive)} of ${formatNumber(summary.employees.total)} employees are currently inactive.`,
      type: 'warning',
    });
  }

  if (summary.campaigns.active !== null && summary.campaigns.active > 0) {
    insights.push({
      title: 'Active Marketing Campaigns',
      description: `${formatNumber(summary.campaigns.active)} marketing ${
        summary.campaigns.active === 1 ? 'campaign is' : 'campaigns are'
      } currently running.`,
      type: 'success',
    });
  }

  // Cap at 6 total insights — prioritise critical and warning first
  const priorityOrder: InsightType[] = ['critical', 'warning', 'success', 'info'];
  insights.sort(
    (a, b) => priorityOrder.indexOf(a.type) - priorityOrder.indexOf(b.type)
  );

  return insights.slice(0, 6);
}

// ============================================================================
// useDragScroll HOOK
// ============================================================================

/**
 * Hook that adds click-and-drag horizontal scrolling to a container.
 * Uses native event listeners (via useEffect) rather than React synthetic
 * events so we can reliably preventDefault on mousedown before the browser
 * starts a text-selection or native drag that swallows subsequent moves.
 */
function useDragScroll<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let isDragging = false;
    let startX = 0;
    let scrollStart = 0;

    const onDown = (e: MouseEvent) => {
      isDragging = true;
      startX = e.clientX;
      scrollStart = el.scrollLeft;
      el.style.cursor = 'grabbing';
      el.style.userSelect = 'none';
      // Prevent text selection / native drag from stealing the gesture
      e.preventDefault();
    };

    const onMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const walk = e.clientX - startX;
      el.scrollLeft = scrollStart - walk;
    };

    const onUp = () => {
      if (!isDragging) return;
      isDragging = false;
      el.style.cursor = 'grab';
      el.style.userSelect = '';
    };

    el.addEventListener('mousedown', onDown);
    // Listen on window so dragging past the element edge still tracks
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);

    return () => {
      el.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  return { ref };
}

// ============================================================================
// COMPONENT
// ============================================================================

export function Dashboard() {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [farmData, setFarmData] = useState<FarmSummaryData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pie chart hover/filter state
  const [hoveredBlockIndex, setHoveredBlockIndex] = useState<number | null>(null);
  const [hoveredCropIndex, setHoveredCropIndex] = useState<number | null>(null);
  const [selectedBlockFarm, setSelectedBlockFarm] = useState<string>('all');
  const [selectedCropFarm, setSelectedCropFarm] = useState<string>('all');
  const [selectedCropKpiFarm, setSelectedCropKpiFarm] = useState<string>('all');

  // Global farming year from sidebar — controls all farm data fetching
  const { selectedYear } = useFarmingYearStore();
  const { data: farmingYearsData } = useFarmingYearsList(5, true);
  const selectedYearDisplay = selectedYear !== null
    ? farmingYearsData?.years?.find((y) => y.year === selectedYear)?.display ?? `Year ${selectedYear}`
    : null;

  // Yield KPI data derived from the main farm summary fetch
  const [yieldKpiData, setYieldKpiData] = useState<FarmYieldKpi[] | null>(null);

  // Drag-to-scroll for the chip legend rows
  const blockLegendDrag = useDragScroll();
  const cropLegendDrag = useDragScroll();

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const farmParams: Record<string, string | number> = {};
      if (selectedYear !== null) farmParams.farmingYear = selectedYear;

      const [summaryRes, farmRes] = await Promise.all([
        apiClient.get<DashboardSummary>('/v1/dashboard/summary'),
        apiClient
          .get<FarmSummaryResponse>('/v1/farm/dashboard/summary', { params: farmParams })
          .catch(() => null),
      ]);

      setData(summaryRes.data);
      if (farmRes?.data?.success && farmRes.data.data) {
        const fd = farmRes.data.data;
        setFarmData(fd);
        if (fd.yieldByFarm) {
          setYieldKpiData(fd.yieldByFarm);
        }
      } else {
        setFarmData(null);
      }
    } catch (err) {
      setError('Failed to load dashboard data. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [selectedYear]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Derived chart data ─────────────────────────────────────────────────────

  const blockChartData = data?.blocks.details
    ? Object.entries(data.blocks.details)
        .filter(([, value]) => value > 0)
        .map(([key, value]) => ({
          name: key.charAt(0).toUpperCase() + key.slice(1),
          value,
          color: BLOCK_STATE_COLORS[key] ?? '#9E9E9E',
        }))
    : [];

  // Farm-sourced chart data — only populated when farmData is available

  const harvestByFarmData = farmData
    ? farmData.harvestSummary.harvestsByFarm
        .filter((f) => f.totalKg > 0)
        .sort((a, b) => b.totalKg - a.totalKg)
        .slice(0, 8)
        .map((f) => ({
          name: f.farmName,
          kg: f.totalKg,
          harvests: f.harvestCount,
        }))
    : [];

  // Aggregate per-farm crop entries into a single "All Farms" view by summing
  // blockCount per cropName. The raw API now returns one entry per (farm, crop).
  const cropDistributionData = (() => {
    if (!farmData) return [];
    const totals = new Map<string, number>();
    for (const c of farmData.cropBreakdown) {
      if (c.blockCount <= 0) continue;
      totals.set(c.cropName, (totals.get(c.cropName) ?? 0) + c.blockCount);
    }
    return [...totals.entries()]
      .sort(([, a], [, b]) => b - a)
      .map(([name, value], i) => ({
        name,
        value,
        color: CROP_PALETTE[i % CROP_PALETTE.length],
      }));
  })();

  const insights = data ? generateInsights(data, farmData) : [];

  // Build farm list for the pie chart dropdown filters
  const farmOptions = farmData?.blocksByFarm
    ?.filter((f) => f.totalBlocks > 0)
    .sort((a, b) => a.farmName.localeCompare(b.farmName)) ?? [];

  // Filter Block Status pie data by selected farm
  const filteredBlockChartData = (() => {
    if (selectedBlockFarm === 'all') return blockChartData;
    const farm = farmData?.blocksByFarm?.find((f) => f.farmId === selectedBlockFarm);
    if (!farm) return blockChartData;
    return Object.entries({
      Growing: farm.growing,
      Fruiting: farm.fruiting,
      Harvesting: farm.harvesting,
      Planned: farm.planned,
      Cleaning: farm.cleaning,
      Alert: farm.alert,
      Partial: farm.partial,
      Empty: farm.empty,
    })
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({
        name,
        value,
        color: BLOCK_STATE_COLORS[name.toLowerCase()] ?? '#9E9E9E',
      }));
  })();

  // Filter Crop Distribution pie data by selected farm
  const filteredCropData = (() => {
    if (selectedCropFarm === 'all') return cropDistributionData;
    const farmCrops = farmData?.cropBreakdown
      ?.filter((c) => c.farmId === selectedCropFarm && c.blockCount > 0)
      .sort((a, b) => b.blockCount - a.blockCount)
      .map((c, i) => ({
        name: c.cropName,
        value: c.blockCount,
        color: CROP_PALETTE[i % CROP_PALETTE.length],
      }));
    return farmCrops ?? cropDistributionData;
  })();

  // Hero metric values derived from data + farmData
  const heroMetrics = data
    ? [
        {
          label: 'Farms',
          value: data.farms.total,
          borderColor: MODULE_COLORS.farms,
        },
        {
          label: 'Active Blocks',
          value: farmData?.overview.activePlantings ?? (data.blocks.active ?? data.blocks.total),
          borderColor: MODULE_COLORS.blocks,
        },
        {
          label: 'Total Yield',
          value: farmData?.yieldByFarm?.reduce((sum, f) => sum + f.actualYieldKg, 0) ?? 0,
          borderColor: MODULE_COLORS.shipments,
          suffix: ' kg',
        },
        {
          label: 'Pending Orders',
          value: data.orders.details?.pending ?? 0,
          borderColor: MODULE_COLORS.orders,
        },
        {
          label: 'Active Alerts',
          value: farmData?.recentActivity.activeAlerts ?? 0,
          borderColor: '#EF4444',
        },
      ]
    : [];

  // ── Render ─────────────────────────────────────────────────────────────────

  const hasFarmData = farmData !== null;

  return (
    <PageContainer>
      {/* ── Section 1: Page header ─────────────────────────────────────────── */}
      <PageHeader>
        <HeaderLeft>
          <PageTitle>Dashboard</PageTitle>
          <PageSubtitle>Executive overview across all modules</PageSubtitle>
        </HeaderLeft>
        <HeaderRight>
          <RefreshButton onClick={fetchData} disabled={isLoading} aria-label="Refresh dashboard">
            <RefreshIcon $spinning={isLoading} aria-hidden="true">
              &#x21BA;
            </RefreshIcon>
            Refresh
          </RefreshButton>
          {data?.lastUpdated && (
            <LastUpdatedText>
              Last updated: {formatTimestamp(data.lastUpdated)}
            </LastUpdatedText>
          )}
        </HeaderRight>
      </PageHeader>

      {/* Loading */}
      {isLoading && (
        <LoadingContainer role="status" aria-live="polite" aria-label="Loading dashboard">
          <Spinner aria-hidden="true" />
          <LoadingText>Loading dashboard...</LoadingText>
        </LoadingContainer>
      )}

      {/* Error */}
      {!isLoading && error && (
        <ErrorContainer role="alert">
          <ErrorTitle>Unable to load dashboard</ErrorTitle>
          <ErrorMessage>{error}</ErrorMessage>
          <RetryButton onClick={fetchData}>Retry</RetryButton>
        </ErrorContainer>
      )}

      {/* Content — single scrollable page */}
      {!isLoading && !error && data && (
        <PageContent>

          {/* ── Section 2: Hero metrics row (5 cards) ─────────────────────── */}
          <PageSection>
            <HeroGrid>
              {heroMetrics.map((metric) => (
                <HeroCard key={metric.label} $borderColor={metric.borderColor}>
                  <KpiValue>
                    {formatNumber(metric.value)}
                    {metric.suffix ?? ''}
                  </KpiValue>
                  <KpiLabel>{metric.label}</KpiLabel>
                </HeroCard>
              ))}
            </HeroGrid>
          </PageSection>

          <SectionDivider />

          {/* ── Section 3: Two pie charts side by side ────────────────────── */}
          <PageSection>
            <ChartRow>
              {/* Block Status Donut Chart */}
              <ChartCard>
                <ChartCardHeader>
                  <CardTitle>Block Status Distribution</CardTitle>
                  {selectedYearDisplay && <ChartYearBadge>{selectedYearDisplay}</ChartYearBadge>}
                  <ChartHeaderSpacer />
                  {hasFarmData && farmOptions.length > 1 && (
                    <ChartFilterSelect
                      value={selectedBlockFarm}
                      onChange={(e) => {
                        setSelectedBlockFarm(e.target.value);
                        setHoveredBlockIndex(null);
                      }}
                    >
                      <option value="all">All Farms</option>
                      {farmOptions.map((f) => (
                        <option key={f.farmId} value={f.farmId}>{f.farmName}</option>
                      ))}
                    </ChartFilterSelect>
                  )}
                </ChartCardHeader>
                {filteredBlockChartData.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={280}>
                      <PieChart>
                        <Pie
                          data={filteredBlockChartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={70}
                          outerRadius={110}
                          paddingAngle={2}
                          dataKey="value"
                          onMouseEnter={(_, index) => setHoveredBlockIndex(index)}
                          onMouseLeave={() => setHoveredBlockIndex(null)}
                        >
                          {filteredBlockChartData.map((entry) => (
                            <Cell key={entry.name} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: number, name: string) => [
                            `${formatNumber(value)} Blocks`,
                            name,
                          ]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <ScrollableLegend ref={blockLegendDrag.ref}>
                      {(hoveredBlockIndex !== null && filteredBlockChartData[hoveredBlockIndex]
                        ? [filteredBlockChartData[hoveredBlockIndex]]
                        : filteredBlockChartData
                      ).map((entry) => (
                        <LegendChip key={entry.name}>
                          <LegendSwatch $color={entry.color} />
                          <LegendLabel>{entry.name}</LegendLabel>
                        </LegendChip>
                      ))}
                    </ScrollableLegend>
                  </>
                ) : (
                  <NoDataText>No block status data available</NoDataText>
                )}
              </ChartCard>

              {/* Crop Distribution Donut */}
              {hasFarmData && (
                <ChartCard>
                  <ChartCardHeader>
                    <CardTitle>Crop Distribution</CardTitle>
                    {selectedYearDisplay && <ChartYearBadge>{selectedYearDisplay}</ChartYearBadge>}
                    <ChartHeaderSpacer />
                    {farmOptions.length > 1 && (
                      <ChartFilterSelect
                        value={selectedCropFarm}
                        onChange={(e) => {
                          setSelectedCropFarm(e.target.value);
                          setHoveredCropIndex(null);
                        }}
                      >
                        <option value="all">All Farms</option>
                        {farmOptions.map((f) => (
                          <option key={f.farmId} value={f.farmId}>{f.farmName}</option>
                        ))}
                      </ChartFilterSelect>
                    )}
                  </ChartCardHeader>
                  {filteredCropData.length > 0 ? (
                    <>
                      <ResponsiveContainer width="100%" height={280}>
                        <PieChart>
                          <Pie
                            data={filteredCropData}
                            cx="50%"
                            cy="50%"
                            innerRadius={70}
                            outerRadius={110}
                            paddingAngle={2}
                            dataKey="value"
                            onMouseEnter={(_, index) => setHoveredCropIndex(index)}
                            onMouseLeave={() => setHoveredCropIndex(null)}
                          >
                            {filteredCropData.map((entry) => (
                              <Cell key={entry.name} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(value: number, name: string) => [
                              `${formatNumber(value)} Blocks`,
                              name,
                            ]}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      {/* Custom scrollable legend. Collapses to the hovered slice only. */}
                      <ScrollableLegend ref={cropLegendDrag.ref}>
                        {(hoveredCropIndex !== null && filteredCropData[hoveredCropIndex]
                          ? [filteredCropData[hoveredCropIndex]]
                          : filteredCropData
                        ).map((entry) => (
                          <LegendChip key={entry.name}>
                            <LegendSwatch $color={entry.color} />
                            <LegendLabel>{entry.name}</LegendLabel>
                          </LegendChip>
                        ))}
                      </ScrollableLegend>
                    </>
                  ) : (
                    <NoDataText>No crop data available</NoDataText>
                  )}
                </ChartCard>
              )}
            </ChartRow>
          </PageSection>

          <SectionDivider />

          {/* ── Section 4: Farm Yield KPI chart (progress-bar style) ──────── */}
          {hasFarmData && (
            <PageSection>
              <ChartCard>
                <ChartCardHeader>
                  <CardTitle>Farm Yield vs Predicted</CardTitle>
                  {selectedYearDisplay && <ChartYearBadge>{selectedYearDisplay}</ChartYearBadge>}
                  <ChartHeaderSpacer />
                </ChartCardHeader>

                {yieldKpiData && yieldKpiData.length > 0 ? (
                  <YieldKpiChart data={yieldKpiData} />
                ) : (
                  <NoDataText>No yield KPI data available for the selected period</NoDataText>
                )}
              </ChartCard>
            </PageSection>
          )}

          {hasFarmData && <SectionDivider />}

          {/* ── Section 5: Crop Yield KPI (leaderboard with farm filter) ──── */}
          {hasFarmData && farmData?.yieldByCrop && farmData.yieldByCrop.length > 0 && (
            <PageSection>
              <ChartCard>
                <ChartCardHeader>
                  <CardTitle>Crop Yield Performance</CardTitle>
                  {selectedYearDisplay && <ChartYearBadge>{selectedYearDisplay}</ChartYearBadge>}
                  <ChartHeaderSpacer />
                  {farmOptions.length > 1 && (
                    <ChartFilterSelect
                      value={selectedCropKpiFarm}
                      onChange={(e) => setSelectedCropKpiFarm(e.target.value)}
                    >
                      <option value="all">All Farms</option>
                      {farmOptions.map((f) => (
                        <option key={f.farmId} value={f.farmId}>{f.farmName}</option>
                      ))}
                    </ChartFilterSelect>
                  )}
                </ChartCardHeader>
                <CropYieldKpiChart
                  data={farmData.yieldByCrop}
                  selectedFarm={selectedCropKpiFarm}
                />
              </ChartCard>
            </PageSection>
          )}

          <SectionDivider />

          {/* ── Section 6: Insights + Orders (two-column) ────────────────── */}
          <PageSection>
            <TwoColumnLayout>
              {/* Left: Key Insights */}
              <ChartCard>
                <CardTitle>Key Insights</CardTitle>
                {insights.length > 0 ? (
                  <InsightsGrid>
                    {insights.map((insight, i) => (
                      <InsightCard key={i} $type={insight.type} role="article">
                        <InsightTitle>{insight.title}</InsightTitle>
                        <InsightDescription>{insight.description}</InsightDescription>
                      </InsightCard>
                    ))}
                  </InsightsGrid>
                ) : (
                  <NoDataText>No insights available yet</NoDataText>
                )}
              </ChartCard>

              {/* Right: Orders Overview — compact status list */}
              <ChartCard>
                <CardTitle>Orders Overview</CardTitle>
                <OrdersOverviewList data={data} />
              </ChartCard>
            </TwoColumnLayout>
          </PageSection>

        </PageContent>
      )}
    </PageContainer>
  );
}

// ============================================================================
// YIELD KPI CHART (progress-bar style — recharts vertical BarChart)
// ============================================================================

interface YieldKpiChartProps {
  data: FarmYieldKpi[];
}

function YieldKpiChart({ data }: YieldKpiChartProps) {
  const sorted = [...data].sort((a, b) => b.efficiencyPercent - a.efficiencyPercent);

  return (
    <LeaderboardTable>
      <LeaderboardHeader>
        <LbRankCol>#</LbRankCol>
        <LbFarmCol>Farm</LbFarmCol>
        <LbKpiCol>KPI</LbKpiCol>
        <LbBarCol>Progress</LbBarCol>
        <LbYieldCol>Yield</LbYieldCol>
      </LeaderboardHeader>
      {sorted.map((farm, i) => {
        const pct = farm.efficiencyPercent;
        const barColor = pct >= 80 ? '#10B981' : pct >= 40 ? '#F59E0B' : '#EF4444';
        return (
          <LeaderboardRow key={farm.farmId}>
            <LbRankCol>
              <LbRank>{i + 1}</LbRank>
            </LbRankCol>
            <LbFarmCol>
              <LbFarmName>{farm.farmName}</LbFarmName>
            </LbFarmCol>
            <LbKpiCol>
              <LbKpiValue $color={barColor}>{pct}%</LbKpiValue>
            </LbKpiCol>
            <LbBarCol>
              <LbProgressTrack>
                <LbProgressFill $pct={Math.min(pct, 100)} $color={barColor} />
              </LbProgressTrack>
            </LbBarCol>
            <LbYieldCol>
              <LbYieldText>
                {formatNumber(Math.round(farm.actualYieldKg))} / {formatNumber(Math.round(farm.predictedYieldKg))} kg
              </LbYieldText>
            </LbYieldCol>
          </LeaderboardRow>
        );
      })}
    </LeaderboardTable>
  );
}

// ============================================================================
// CROP YIELD KPI (leaderboard with farm filter)
// ============================================================================

const CROP_KPI_DEFAULT_VISIBLE = 5;

interface CropYieldKpiChartProps {
  data: CropYieldKpi[];
  selectedFarm: string;
}

function CropYieldKpiChart({ data, selectedFarm }: CropYieldKpiChartProps) {
  const [expanded, setExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCrops, setSelectedCrops] = useState<Set<string>>(new Set());

  // Filter by farm, then aggregate by cropName
  const filtered = selectedFarm === 'all' ? data : data.filter((c) => c.farmId === selectedFarm);

  const byCrop = new Map<string, { actual: number; predicted: number }>();
  for (const c of filtered) {
    const existing = byCrop.get(c.cropName) ?? { actual: 0, predicted: 0 };
    existing.actual += c.actualYieldKg;
    existing.predicted += c.predictedYieldKg;
    byCrop.set(c.cropName, existing);
  }

  const allSorted = [...byCrop.entries()]
    .map(([cropName, { actual, predicted }]) => ({
      cropName,
      actualYieldKg: actual,
      predictedYieldKg: predicted,
      efficiencyPercent: predicted > 0 ? Math.round((actual / predicted) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.efficiencyPercent - a.efficiencyPercent);

  // When specific crops are selected, show only those (for comparison).
  // Otherwise show top N or all (if expanded).
  const displayList = selectedCrops.size > 0
    ? allSorted.filter((c) => selectedCrops.has(c.cropName))
    : expanded
      ? allSorted
      : allSorted.slice(0, CROP_KPI_DEFAULT_VISIBLE);

  const hasMore = selectedCrops.size === 0 && allSorted.length > CROP_KPI_DEFAULT_VISIBLE;

  // Search results for the crop picker
  const searchResults = searchQuery.trim().length > 0
    ? allSorted.filter((c) =>
        c.cropName.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !selectedCrops.has(c.cropName)
      ).slice(0, 8)
    : [];

  const toggleCrop = (cropName: string) => {
    setSelectedCrops((prev) => {
      const next = new Set(prev);
      if (next.has(cropName)) {
        next.delete(cropName);
      } else {
        next.add(cropName);
      }
      return next;
    });
    setSearchQuery('');
  };

  const clearSelection = () => {
    setSelectedCrops(new Set());
    setSearchQuery('');
  };

  if (allSorted.length === 0) {
    return <NoDataText>No crop yield data available</NoDataText>;
  }

  return (
    <>
      {/* Crop search/filter bar */}
      <CropFilterBar>
        <CropSearchWrapper>
          <CropSearchInput
            type="text"
            placeholder="Search crops to compare..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchResults.length > 0 && (
            <CropSearchDropdown>
              {searchResults.map((c) => (
                <CropSearchItem key={c.cropName} onClick={() => toggleCrop(c.cropName)}>
                  <span>{c.cropName}</span>
                  <CropSearchItemKpi $color={c.efficiencyPercent >= 80 ? '#10B981' : c.efficiencyPercent >= 40 ? '#F59E0B' : '#EF4444'}>
                    {c.efficiencyPercent}%
                  </CropSearchItemKpi>
                </CropSearchItem>
              ))}
            </CropSearchDropdown>
          )}
        </CropSearchWrapper>
        {selectedCrops.size > 0 && (
          <CropChipsRow>
            {[...selectedCrops].map((name) => (
              <CropChip key={name}>
                {name}
                <CropChipRemove onClick={() => toggleCrop(name)}>×</CropChipRemove>
              </CropChip>
            ))}
            <CropChipClear onClick={clearSelection}>Clear all</CropChipClear>
          </CropChipsRow>
        )}
      </CropFilterBar>

      {/* Leaderboard */}
      <LeaderboardTable>
        <LeaderboardHeader>
          <LbRankCol>#</LbRankCol>
          <LbFarmCol>Crop</LbFarmCol>
          <LbKpiCol>KPI</LbKpiCol>
          <LbBarCol>Progress</LbBarCol>
          <LbYieldCol>Yield</LbYieldCol>
        </LeaderboardHeader>
        {displayList.map((crop, i) => {
          const pct = crop.efficiencyPercent;
          const barColor = pct >= 80 ? '#10B981' : pct >= 40 ? '#F59E0B' : '#EF4444';
          return (
            <LeaderboardRow key={crop.cropName}>
              <LbRankCol>
                <LbRank>{i + 1}</LbRank>
              </LbRankCol>
              <LbFarmCol>
                <LbFarmName>{crop.cropName}</LbFarmName>
              </LbFarmCol>
              <LbKpiCol>
                <LbKpiValue $color={barColor}>{pct}%</LbKpiValue>
              </LbKpiCol>
              <LbBarCol>
                <LbProgressTrack>
                  <LbProgressFill $pct={Math.min(pct, 100)} $color={barColor} />
                </LbProgressTrack>
              </LbBarCol>
              <LbYieldCol>
                <LbYieldText>
                  {formatNumber(Math.round(crop.actualYieldKg))} / {formatNumber(Math.round(crop.predictedYieldKg))} kg
                </LbYieldText>
              </LbYieldCol>
            </LeaderboardRow>
          );
        })}
      </LeaderboardTable>

      {/* Show more / less toggle */}
      {hasMore && (
        <ShowMoreButton onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Show top 5 only' : `Show all ${allSorted.length} crops`}
        </ShowMoreButton>
      )}
    </>
  );
}

// ============================================================================
// ORDERS OVERVIEW (compact list)
// ============================================================================

interface OrdersOverviewListProps {
  data: DashboardSummary;
}

function OrdersOverviewList({ data }: OrdersOverviewListProps) {
  const statusColors: Record<string, string> = {
    pending: MODULE_COLORS.orders,
    processing: '#F59E0B',
    delivered: '#10B981',
  };

  const rows: { key: string; label: string; count: number }[] = [
    { key: 'pending', label: 'Pending', count: data.orders.details?.pending ?? 0 },
    { key: 'processing', label: 'Processing', count: data.orders.details?.processing ?? 0 },
    { key: 'delivered', label: 'Delivered', count: data.orders.details?.delivered ?? 0 },
  ];

  // Also add any extra statuses from details not covered above
  const knownKeys = new Set(['pending', 'processing', 'delivered']);
  if (data.orders.details) {
    for (const [key, val] of Object.entries(data.orders.details)) {
      if (!knownKeys.has(key) && val > 0) {
        rows.push({
          key,
          label: key.charAt(0).toUpperCase() + key.slice(1),
          count: val,
        });
      }
    }
  }

  return (
    <OrdersListWrapper>
      <OrdersTotalRow>
        <OrdersTotalLabel>Total Orders</OrdersTotalLabel>
        <OrdersTotalValue>{formatNumber(data.orders.total)}</OrdersTotalValue>
      </OrdersTotalRow>
      {rows.map((row) => (
        <OrderStatusRow key={row.key}>
          <OrderStatusLeft>
            <StatusDot $color={statusColors[row.key] ?? '#9E9E9E'} />
            <OrderStatusLabel>{row.label}</OrderStatusLabel>
          </OrderStatusLeft>
          <OrderStatusCount>{formatNumber(row.count)}</OrderStatusCount>
        </OrderStatusRow>
      ))}
    </OrdersListWrapper>
  );
}

// ============================================================================
// ANIMATIONS
// ============================================================================

const spinAnimation = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const spinnerAnimation = keyframes`
  to { transform: rotate(360deg); }
`;

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const PageContainer = styled.div`
  padding: ${({ theme }) => theme.spacing.md};
  width: 100%;
  min-height: 100vh;
  background: ${({ theme }) => theme.colors.surface};

  @media (min-width: ${({ theme }) => theme.breakpoints.tablet}) {
    padding: ${({ theme }) => theme.spacing.lg};
  }

  @media (min-width: ${({ theme }) => theme.breakpoints.desktop}) {
    padding: ${({ theme }) => theme.spacing.xl};
  }
`;

const PageHeader = styled.header`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
  margin-bottom: ${({ theme }) => theme.spacing.lg};

  @media (min-width: ${({ theme }) => theme.breakpoints.tablet}) {
    flex-direction: row;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: ${({ theme }) => theme.spacing.xl};
  }
`;

const HeaderLeft = styled.div`
  flex: 1;
`;

const PageTitle = styled.h1`
  font-size: ${({ theme }) => theme.typography.fontSize['2xl']};
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 ${({ theme }) => theme.spacing.xs} 0;
  line-height: ${({ theme }) => theme.typography.lineHeight.tight};

  @media (min-width: ${({ theme }) => theme.breakpoints.tablet}) {
    font-size: ${({ theme }) => theme.typography.fontSize['3xl']};
  }
`;

const PageSubtitle = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0;

  @media (min-width: ${({ theme }) => theme.breakpoints.tablet}) {
    font-size: ${({ theme }) => theme.typography.fontSize.base};
  }
`;

const HeaderRight = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
  flex-wrap: wrap;
`;

const RefreshButton = styled.button`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};
  background: ${({ theme }) => theme.colors.primary[500]};
  color: ${({ theme }) => theme.colors.background};
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  cursor: pointer;
  transition: background 150ms ease-in-out;
  white-space: nowrap;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.primary[700]};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const RefreshIcon = styled.span<{ $spinning: boolean }>`
  display: inline-block;
  font-style: normal;
  animation: ${({ $spinning }) => ($spinning ? spinAnimation : 'none')} 1s linear infinite;
`;

const LastUpdatedText = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0;
  white-space: nowrap;
`;

// ── Page content wrapper ────────────────────────────────────────────────────

const PageContent = styled.main`
  display: flex;
  flex-direction: column;
  gap: 0;
`;

const PageSection = styled.section`
  padding: ${({ theme }) => theme.spacing.xl} 0;
`;

const SectionDivider = styled.hr`
  border: none;
  border-top: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  margin: 0;
`;

// ── Hero metric cards ───────────────────────────────────────────────────────

const HeroGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: ${({ theme }) => theme.spacing.md};

  @media (min-width: ${({ theme }) => theme.breakpoints.tablet}) {
    grid-template-columns: repeat(3, 1fr);
  }

  @media (min-width: ${({ theme }) => theme.breakpoints.desktop}) {
    grid-template-columns: repeat(5, 1fr);
  }
`;

const HeroCard = styled.article<{ $borderColor: string }>`
  background: ${({ theme }) => theme.colors.background};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  padding: ${({ theme }) => theme.spacing.xl};
  box-shadow: ${({ theme }) => theme.shadows.sm};
  border-left: 4px solid ${({ $borderColor }) => $borderColor};
  transition: box-shadow 150ms ease-in-out;

  &:hover {
    box-shadow: ${({ theme }) => theme.shadows.md};
  }
`;

const KpiValue = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSize['2xl']};
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 ${({ theme }) => theme.spacing.xs} 0;
  line-height: ${({ theme }) => theme.typography.lineHeight.tight};
`;

const KpiLabel = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  color: ${({ theme }) => theme.colors.textSecondary};
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0;
`;

// ── Chart layouts ───────────────────────────────────────────────────────────

const ChartRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: ${({ theme }) => theme.spacing.lg};

  @media (min-width: ${({ theme }) => theme.breakpoints.desktop}) {
    /* minmax(0, 1fr) prevents grid items from expanding past their share
       when their content has a large intrinsic min-width — e.g. the
       nowrap scrollable crop-distribution legend below. */
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    align-items: start;
  }
`;

const TwoColumnLayout = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: ${({ theme }) => theme.spacing.lg};

  @media (min-width: ${({ theme }) => theme.breakpoints.desktop}) {
    grid-template-columns: 1fr 1fr;
    align-items: start;
  }
`;

// ── Chart card ──────────────────────────────────────────────────────────────

const ChartCard = styled.div`
  background: ${({ theme }) => theme.colors.background};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  padding: ${({ theme }) => theme.spacing.xl};
  box-shadow: ${({ theme }) => theme.shadows.sm};
`;

const CardTitle = styled.h3`
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 ${({ theme }) => theme.spacing.md} 0;
`;

const ChartCardHeader = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  margin-bottom: ${({ theme }) => theme.spacing.md};
  flex-wrap: wrap;

  & > h3 {
    margin-bottom: 0;
  }
`;

const ChartHeaderSpacer = styled.div`
  flex: 1;
  min-width: ${({ theme }) => theme.spacing.sm};
`;

const ChartYearBadge = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  border-radius: ${({ theme }) => theme.borderRadius.full};
  background: ${({ theme }) => theme.colors.primary[50]};
  color: ${({ theme }) => theme.colors.primary[700]};
  border: 1px solid ${({ theme }) => theme.colors.primary[200]};
`;

const ChartFilterSelect = styled.select`
  padding: 6px 12px;
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.textPrimary};
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary[500]};
  }
`;

// ── Scrollable chip legend ──────────────────────────────────────────────────

const ScrollableLegend = styled.div`
  display: flex;
  flex-wrap: nowrap;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.sm} 0;
  overflow-x: auto;
  cursor: grab;
  width: fit-content;
  max-width: 100%;
  margin: 0 auto;
  /* Hide scrollbar entirely — users scroll via trackpad / shift+wheel. */
  scrollbar-width: none;
  -ms-overflow-style: none;
  &::-webkit-scrollbar {
    display: none;
  }
`;

const LegendChip = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  padding: 4px 10px;
  background: ${({ theme }) => theme.colors.surface};
  border-radius: 999px;
  white-space: nowrap;
`;

const LegendSwatch = styled.span<{ $color: string }>`
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 2px;
  background: ${({ $color }) => $color};
  flex-shrink: 0;
`;

const LegendLabel = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

// ── Insights grid ───────────────────────────────────────────────────────────

const INSIGHT_BORDER_COLORS: Record<InsightType, string> = {
  success: '#10B981',
  warning: '#F59E0B',
  info: '#3B82F6',
  critical: '#EF4444',
};

const INSIGHT_BG_COLORS: Record<InsightType, string> = {
  success: 'rgba(16, 185, 129, 0.06)',
  warning: 'rgba(245, 158, 11, 0.06)',
  info: 'rgba(59, 130, 246, 0.06)',
  critical: 'rgba(239, 68, 68, 0.06)',
};

const InsightsGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: ${({ theme }) => theme.spacing.md};

  @media (min-width: ${({ theme }) => theme.breakpoints.tablet}) {
    grid-template-columns: repeat(2, 1fr);
  }
`;

const InsightCard = styled.article<{ $type: InsightType }>`
  background: ${({ $type }) => INSIGHT_BG_COLORS[$type]};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  padding: ${({ theme }) => theme.spacing.md};
  border-left: 4px solid ${({ $type }) => INSIGHT_BORDER_COLORS[$type]};
  box-shadow: ${({ theme }) => theme.shadows.sm};
`;

const InsightTitle = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 ${({ theme }) => theme.spacing.xs} 0;
`;

const InsightDescription = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0;
  line-height: ${({ theme }) => theme.typography.lineHeight.normal};
`;

// ── Yield KPI chart ─────────────────────────────────────────────────────────

const CropFilterBar = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const CropSearchWrapper = styled.div`
  position: relative;
`;

const CropSearchInput = styled.input`
  width: 100%;
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.textPrimary};
  transition: border-color 0.15s ease;

  &::placeholder {
    color: ${({ theme }) => theme.colors.textDisabled};
  }

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary[500]};
  }
`;

const CropSearchDropdown = styled.div`
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 4px;
  background: ${({ theme }) => theme.colors.background};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  box-shadow: ${({ theme }) => theme.shadows.lg};
  z-index: ${({ theme }) => theme.zIndex.dropdown};
  max-height: 200px;
  overflow-y: auto;
`;

const CropSearchItem = styled.button`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textPrimary};
  background: transparent;
  border: none;
  cursor: pointer;
  font-family: inherit;
  text-align: left;

  &:hover {
    background: ${({ theme }) => theme.colors.surface};
  }
`;

const CropSearchItemKpi = styled.span<{ $color: string }>`
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ $color }) => $color};
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
`;

const CropChipsRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
`;

const CropChip = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  color: ${({ theme }) => theme.colors.primary[700]};
  background: ${({ theme }) => theme.colors.infoBg};
  border-radius: 999px;
`;

const CropChipRemove = styled.button`
  background: none;
  border: none;
  color: ${({ theme }) => theme.colors.primary[500]};
  cursor: pointer;
  font-size: 14px;
  padding: 0;
  line-height: 1;

  &:hover {
    color: ${({ theme }) => theme.colors.error};
  }
`;

const CropChipClear = styled.button`
  background: none;
  border: none;
  color: ${({ theme }) => theme.colors.textDisabled};
  cursor: pointer;
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  padding: 2px 6px;
  text-decoration: underline;

  &:hover {
    color: ${({ theme }) => theme.colors.textSecondary};
  }
`;

const ShowMoreButton = styled.button`
  display: block;
  width: 100%;
  padding: ${({ theme }) => theme.spacing.sm};
  margin-top: ${({ theme }) => theme.spacing.sm};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  color: ${({ theme }) => theme.colors.primary[500]};
  background: transparent;
  border: 1px dashed ${({ theme }) => theme.colors.neutral[300]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: ${({ theme }) => theme.colors.surface};
    border-color: ${({ theme }) => theme.colors.primary[500]};
  }
`;

const LeaderboardTable = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const LeaderboardHeader = styled.div`
  display: grid;
  grid-template-columns: 36px 1fr 64px 1fr 140px;
  gap: 8px;
  align-items: center;
  padding: 8px 12px;
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textDisabled};
  text-transform: uppercase;
  letter-spacing: 0.5px;

  @media (max-width: 640px) {
    grid-template-columns: 28px 1fr 48px 1fr;
  }
`;

const LeaderboardRow = styled.div`
  display: grid;
  grid-template-columns: 36px 1fr 64px 1fr 140px;
  gap: 8px;
  align-items: center;
  padding: 10px 12px;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  transition: background 150ms ease-in-out;

  &:nth-child(even) {
    background: ${({ theme }) => theme.colors.neutral[50]};
  }

  &:hover {
    background: ${({ theme }) => theme.colors.surface};
  }

  @media (max-width: 640px) {
    grid-template-columns: 28px 1fr 48px 1fr;
  }
`;

const LbRankCol = styled.div`
  text-align: center;
`;

const LbFarmCol = styled.div`
  overflow: hidden;
`;

const LbKpiCol = styled.div`
  text-align: right;
`;

const LbBarCol = styled.div``;

const LbYieldCol = styled.div`
  text-align: right;

  @media (max-width: 640px) {
    display: none;
  }
`;

const LbRank = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: ${({ theme }) => theme.colors.neutral[100]};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
`;

const LbFarmName = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  color: ${({ theme }) => theme.colors.textPrimary};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const LbKpiValue = styled.span<{ $color: string }>`
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
  color: ${({ $color }) => $color};
`;

const LbProgressTrack = styled.div`
  width: 100%;
  height: 8px;
  background: ${({ theme }) => theme.colors.neutral[200]};
  border-radius: 4px;
  overflow: hidden;
`;

const LbProgressFill = styled.div<{ $pct: number; $color: string }>`
  height: 100%;
  width: ${({ $pct }) => $pct}%;
  background: ${({ $color }) => $color};
  border-radius: 4px;
  transition: width 500ms ease-in-out;
`;

const LbYieldText = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  color: ${({ theme }) => theme.colors.textSecondary};
  white-space: nowrap;
`;

const YieldChartWrapper = styled.div`
  width: 100%;
  overflow-x: auto;
`;

const YieldLoadingRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.xl} 0;
`;

const SmallSpinner = styled.div`
  width: 20px;
  height: 20px;
  border: 3px solid ${({ theme }) => theme.colors.neutral[300]};
  border-top-color: ${({ theme }) => theme.colors.primary[500]};
  border-radius: ${({ theme }) => theme.borderRadius.full};
  animation: ${spinnerAnimation} 1s linear infinite;
  flex-shrink: 0;
`;

// ── Orders overview ─────────────────────────────────────────────────────────

const OrdersListWrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0;
`;

const OrdersTotalRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: ${({ theme }) => theme.spacing.sm} 0;
  margin-bottom: ${({ theme }) => theme.spacing.sm};
  border-bottom: 2px solid ${({ theme }) => theme.colors.neutral[200]};
`;

const OrdersTotalLabel = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textSecondary};
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const OrdersTotalValue = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSize.xl};
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const OrderStatusRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: ${({ theme }) => `${theme.spacing.sm} 0`};

  & + & {
    border-top: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  }
`;

const OrderStatusLeft = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const OrderStatusLabel = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const OrderStatusCount = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const StatusDot = styled.span<{ $color: string }>`
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: ${({ theme }) => theme.borderRadius.full};
  background: ${({ $color }) => $color};
  flex-shrink: 0;
`;

// ── Loading & Error ─────────────────────────────────────────────────────────

const LoadingContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  gap: ${({ theme }) => theme.spacing.md};
`;

const Spinner = styled.div`
  width: 48px;
  height: 48px;
  border: 4px solid ${({ theme }) => theme.colors.neutral[300]};
  border-top-color: ${({ theme }) => theme.colors.primary[500]};
  border-radius: ${({ theme }) => theme.borderRadius.full};
  animation: ${spinnerAnimation} 1s linear infinite;
`;

const LoadingText = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0;
`;

const ErrorContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 40vh;
  gap: ${({ theme }) => theme.spacing.md};
  text-align: center;
  padding: ${({ theme }) => theme.spacing.xl};
  background: ${({ theme }) => theme.colors.background};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  border: 2px solid ${({ theme }) => theme.colors.error};
  max-width: 480px;
  margin: ${({ theme }) => `${theme.spacing['2xl']} auto`};
`;

const ErrorTitle = styled.h2`
  font-size: ${({ theme }) => theme.typography.fontSize.xl};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.error};
  margin: 0;
`;

const ErrorMessage = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0;
`;

const RetryButton = styled.button`
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.xl}`};
  background: ${({ theme }) => theme.colors.error};
  color: ${({ theme }) => theme.colors.background};
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  cursor: pointer;
  transition: opacity 150ms ease-in-out;

  &:hover {
    opacity: 0.85;
  }
`;

const NoDataText = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  text-align: center;
  padding: ${({ theme }) => theme.spacing.xl} 0;
  margin: 0;
`;
