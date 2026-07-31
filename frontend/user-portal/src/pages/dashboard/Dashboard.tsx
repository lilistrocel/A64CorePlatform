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

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import styled, { keyframes, useTheme, type DefaultTheme } from 'styled-components';
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
import { useQuery } from '@tanstack/react-query';
import { Wheat, BarChart3, RefreshCw } from 'lucide-react';
import {
  PageHeader as SharedPageHeader,
  glassPanel,
  glassControl,
  glassOpaque,
  monoLabel,
  goldThread,
} from '@a64core/shared';
import { apiClient } from '../../services/api';
import { useFarmingYearStore } from '../../stores/farmingYear.store';
import { useFarmingYearsList } from '../../hooks/queries/useFarmingYears';
import { useAuthStore } from '../../stores/auth.store';
import { getFarms } from '../../services/farmApi';
import {
  useFinancePnlSummary,
  useFinancePnlByMonth,
  useFinancePnlByFarm,
  useFinancePnlByCrop,
  useFinancePnlArAging,
  useFinanceRevenueSources,
} from '../../hooks/useFinancePnl';
import { PnlFiltersBar } from '../../components/pnl/PnlFiltersBar';
import { PnlKpiCards } from '../../components/pnl/PnlKpiCards';
import { PnlRevenueTrendChart } from '../../components/pnl/PnlRevenueTrendChart';
import { PnlBreakdownCharts } from '../../components/pnl/PnlBreakdownCharts';
import { PnlStatementTable } from '../../components/pnl/PnlStatementTable';
import { PnlArAging } from '../../components/pnl/PnlArAging';
import { PnlRevenueConfidence } from '../../components/pnl/PnlRevenueConfidence';
import type { PnlFilters } from '../pnl/PnLPage';
import type { PnlFilterParams } from '../../types/finance';
import type { Farm } from '../../types/farm';

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

/**
 * Categorical colour maps, built from the brand's four chromatic ramps
 * (lapis, emerald, terracotta, gold) rather than the old ad-hoc palette.
 * These are functions of `theme`, not module-level constants, because
 * `textDisabled` / `textSecondary` invert between light and dark theme and
 * must be resolved against the live theme at render time.
 */
function getModuleColors(theme: DefaultTheme): Record<string, string> {
  return {
    farms: theme.colors.bright.emerald,
    blocks: theme.colors.bright.lapis,
    employees: theme.colors.bright.lavender,
    // Night Observatory (T-901): was theme.colors.warning (== gold-b) — a
    // categorical card-accent use of the reserved harvesting/gold hue,
    // which spec §3 explicitly forbids ("not a chart series default").
    // bright.rose keeps it warm and distinct from orders'/campaigns' terra.
    customers: theme.colors.bright.rose,
    orders: theme.colors.bright.coral,
    vehicles: theme.colors.bright.verdi,
    // Feeds the "Total Yield" hero card — emerald reads as the yield/growth
    // metric, matching the "alive/growing" convention (spec §4/§3).
    shipments: theme.colors.bright.emerald,
    campaigns: theme.colors.bright.terra,
    users: theme.colors.celeste,
  };
}

/**
 * Night Observatory (T-901): block states are a farm-specific vocabulary
 * extrapolated onto the spec §5 phase map (§5.2 authorises this) rather than
 * an ad-hoc primary/success/warning mix. `harvesting` -> phase.harvesting is
 * the literal harvest phase — the one place gold is earned here, not spent
 * arbitrarily.
 */
function getBlockStateColors(theme: DefaultTheme): Record<string, string> {
  return {
    empty: theme.colors.phase.empty,
    planned: theme.colors.phase.preparing,
    growing: theme.colors.phase.inoculated,
    fruiting: theme.colors.phase.fruiting,
    harvesting: theme.colors.phase.harvesting,
    cleaning: theme.colors.phase.cleaning,
    alert: theme.colors.phase.quarantined,
    partial: theme.colors.phase.colonizing,
  };
}

/**
 * 10-swatch categorical palette for the crop-distribution donut, built from
 * the full `bright.*` ramp (spec §1.2 — the brand's dark-ground-tuned
 * categorical hues) rather than mixing semantic/status tokens into a chart
 * palette. No `bright.gold` at index 0/1 repeat position — gold stays
 * reserved (spec §3); it only appears once, in the Charts-prescribed series
 * order position, matching ChartWidget's shared convention.
 */
function getCropPalette(theme: DefaultTheme): string[] {
  return [
    theme.colors.celeste,
    theme.colors.bright.gold,
    theme.colors.bright.emerald,
    theme.colors.bright.lapis,
    theme.colors.bright.terra,
    theme.colors.bright.lavender,
    theme.colors.bright.laurel,
    theme.colors.bright.verdi,
    theme.colors.bright.rose,
    theme.colors.bright.coral,
  ];
}

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
// P&L TAB HELPERS
// ============================================================================

/** Mirror of the same guard in PnLPage — no import needed, keep it local. */
function hasFinanceAccess(user: ReturnType<typeof useAuthStore>['user']): boolean {
  if (!user) return false;
  if (user.role === 'super_admin') return true;
  const perms = (user as unknown as { permissions?: string[] }).permissions;
  if (Array.isArray(perms) && perms.includes('finance.view')) return true;
  return false;
}

/**
 * Convert a numeric farming year from the global sidebar store (e.g. 2025)
 * to the string format the P&L API expects (e.g. 'FY2025').
 * Returns an empty string when no year is selected (meaning "all time").
 */
function yearNumberToFyString(year: number | null): string {
  if (year === null) return '';
  return `FY${year}`;
}

/** Mirror of filtersToApiParams from PnLPage. */
function pnlFiltersToApiParams(filters: PnlFilters): PnlFilterParams {
  const params: PnlFilterParams = {};
  if (filters.farmId) params.farmId = filters.farmId;
  if (filters.farmingYear && filters.farmingYear !== 'custom') {
    params.farmingYear = filters.farmingYear;
  }
  if (filters.farmingYear === 'custom') {
    if (filters.startDate) params.startDate = filters.startDate;
    if (filters.endDate) params.endDate = filters.endDate;
  }
  if (!filters.includeImputed) params.includeImputed = false;
  if (filters.cropName) params.cropName = filters.cropName;
  return params;
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
  const theme = useTheme();
  const MODULE_COLORS = useMemo(() => getModuleColors(theme), [theme]);
  const BLOCK_STATE_COLORS = useMemo(() => getBlockStateColors(theme), [theme]);
  const CROP_PALETTE = useMemo(() => getCropPalette(theme), [theme]);
  // Recharts tooltips render outside styled-components' theme context, so
  // they need the glassOpaque recipe (spec §4 "Charts": "tooltips glassOpaque")
  // reproduced as an inline style object rather than the mixin.
  const chartTooltipStyle = {
    backgroundColor: theme.colors.cosmosHi,
    border: `1px solid ${theme.colors.glass.border}`,
    borderRadius: '10px',
    boxShadow: '0 12px 32px rgba(4, 6, 18, 0.5)',
    color: theme.colors.textPrimary,
    fontSize: '0.8rem',
  };
  const chartTooltipLabelStyle = { color: theme.colors.celeste };

  const [data, setData] = useState<DashboardSummary | null>(null);
  const [farmData, setFarmData] = useState<FarmSummaryData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tab state — only shown when user has finance access
  const { user } = useAuthStore();
  const canViewPnl = hasFinanceAccess(user);
  const [activeTab, setActiveTab] = useState<'farm' | 'pnl'>('farm');

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
          color: BLOCK_STATE_COLORS[key] ?? theme.colors.textDisabled,
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
        color: BLOCK_STATE_COLORS[name.toLowerCase()] ?? theme.colors.textDisabled,
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

  // Hero metric values derived from data + farmData.
  // Night Observatory (T-901) gold discipline (spec §3): only the single
  // most important number on the landing page (Farms — first card, the
  // headline count) carries gold + the goldThread top accent. "Alive/growing"
  // metrics use bright.emerald; status metrics borrow their exact phase
  // colour (pending -> fruitingInit/terra, alerts -> quarantined/coral) so
  // the same vocabulary reads consistently across the whole app (spec §5.2).
  const heroMetrics = data
    ? [
        {
          label: 'Farms',
          value: data.farms.total,
          borderColor: MODULE_COLORS.farms,
          valueColor: theme.colors.secondary[500],
          isPrimary: true,
        },
        {
          label: 'Active Blocks',
          value: farmData?.overview.activePlantings ?? (data.blocks.active ?? data.blocks.total),
          borderColor: MODULE_COLORS.blocks,
          valueColor: theme.colors.bright.emerald,
        },
        {
          label: 'Total Yield',
          value: farmData?.yieldByFarm?.reduce((sum, f) => sum + f.actualYieldKg, 0) ?? 0,
          borderColor: MODULE_COLORS.shipments,
          valueColor: theme.colors.bright.emerald,
          suffix: ' kg',
        },
        {
          label: 'Pending Orders',
          value: data.orders.details?.pending ?? 0,
          borderColor: MODULE_COLORS.orders,
          valueColor: theme.colors.phase.fruitingInit,
        },
        {
          label: 'Active Alerts',
          value: farmData?.recentActivity.activeAlerts ?? 0,
          borderColor: theme.colors.phase.quarantined,
          valueColor: theme.colors.phase.quarantined,
        },
      ]
    : [];

  // ── Render ─────────────────────────────────────────────────────────────────

  const hasFarmData = farmData !== null;


  return (
    <PageContainer>
      {/* ── Section 1: Page header ─────────────────────────────────────────── */}
      {/* Night Observatory (T-901): the dashboard is the app's landing surface,
          so its header is exactly the shared PageHeader pattern (spec §4 "Page
          header" / mockup .topline) — breadcrumb + H1 + description, with the
          refresh/last-updated actions as a sibling row (PageHeader itself has
          no action-button slot). */}
      <SharedPageHeader
        breadcrumb="Operations · Live"
        title="Dashboard"
        description="Executive overview across all modules"
      />
      <HeaderActionsRow>
        {selectedYearDisplay && <ChartYearBadge>{selectedYearDisplay}</ChartYearBadge>}
        <HeaderActionsSpacer />
        <RefreshButton onClick={fetchData} disabled={isLoading} aria-label="Refresh dashboard">
          <RefreshIcon $spinning={isLoading} aria-hidden="true">
            <RefreshCw size={14} strokeWidth={1.8} />
          </RefreshIcon>
          Refresh
        </RefreshButton>
        {data?.lastUpdated && (
          <LastUpdatedText>
            Last updated: {formatTimestamp(data.lastUpdated)}
          </LastUpdatedText>
        )}
      </HeaderActionsRow>

      {/* ── Tab bar (only rendered when user has P&L access) ───────────────── */}
      {canViewPnl && (
        <TabBar role="tablist" aria-label="Dashboard sections">
          <TabPill
            role="tab"
            aria-selected={activeTab === 'farm'}
            $active={activeTab === 'farm'}
            onClick={() => setActiveTab('farm')}
          >
            <TabIcon aria-hidden="true"><Wheat size={24} strokeWidth={1.6} /></TabIcon>
            <TabLabelGroup>
              <TabLabel>Farm Overview</TabLabel>
              <TabHint>Blocks, crops, yield performance</TabHint>
            </TabLabelGroup>
          </TabPill>
          <TabPill
            role="tab"
            aria-selected={activeTab === 'pnl'}
            $active={activeTab === 'pnl'}
            onClick={() => setActiveTab('pnl')}
          >
            <TabIcon aria-hidden="true"><BarChart3 size={24} strokeWidth={1.6} /></TabIcon>
            <TabLabelGroup>
              <TabLabel>Profit &amp; Loss</TabLabel>
              <TabHint>Revenue, margins, receivables</TabHint>
            </TabLabelGroup>
          </TabPill>
        </TabBar>
      )}

      {/* ── P&L tab content (lazily mounted — hooks only fire when active) ── */}
      {canViewPnl && activeTab === 'pnl' && <PnLTab />}

      {/* ── Farm Overview tab content ────────────────────────────────────── */}
      {activeTab === 'farm' && (
        <>
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
                <HeroCard
                  key={metric.label}
                  $borderColor={metric.borderColor}
                  $gold={!!metric.isPrimary}
                >
                  <KpiValue $color={metric.valueColor}>
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
                          contentStyle={chartTooltipStyle}
                          labelStyle={chartTooltipLabelStyle}
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
        </>
      )}
    </PageContainer>
  );
}

// ============================================================================
// P&L TAB SUB-COMPONENT
// Mounted only when the P&L tab is active — prevents wasted API calls while
// the user is on Farm Overview. Reads farming year from the global sidebar
// store and injects it into filter state so the global year selector drives
// all P&L queries, matching the Farm Overview behaviour.
// ============================================================================

const REVENUE_CROP_DEFAULT_VISIBLE = 5;

function PnLTab() {
  const theme = useTheme();
  const { selectedYear } = useFarmingYearStore();
  const { data: pnlFarmingYearsData } = useFarmingYearsList(5, true);
  const selectedYearDisplay = selectedYear !== null
    ? pnlFarmingYearsData?.years?.find((y) => y.year === selectedYear)?.display ?? `Year ${selectedYear}`
    : null;

  // Local filter state — resets when the user navigates away and comes back
  const [filters, setFilters] = useState<PnlFilters>({
    farmId: '',
    // Derive the FY string from the global numeric year (e.g. 2025 -> 'FY2025')
    farmingYear: yearNumberToFyString(selectedYear),
    startDate: '',
    endDate: '',
    includeImputed: true,
    cropName: '',
  });

  // Keep farmingYear in sync when the global sidebar year changes
  const farmingYearFromStore = yearNumberToFyString(selectedYear);
  const prevFarmingYearRef = useRef(farmingYearFromStore);
  useEffect(() => {
    if (prevFarmingYearRef.current !== farmingYearFromStore) {
      prevFarmingYearRef.current = farmingYearFromStore;
      setFilters((prev) => ({ ...prev, farmingYear: farmingYearFromStore, startDate: '', endDate: '' }));
    }
  }, [farmingYearFromStore]);

  const apiParams = useMemo(() => pnlFiltersToApiParams(filters), [filters]);

  const handleFilterChange = useCallback((next: Partial<PnlFilters>) => {
    setFilters((prev) => ({ ...prev, ...next }));
  }, []);

  const farmsQuery = useQuery({
    queryKey: ['farms', 'all-for-pnl-dashboard'],
    queryFn: () => getFarms(1, 100),
    staleTime: 10 * 60 * 1000,
  });

  const farmOptions = useMemo(
    () =>
      (farmsQuery.data?.items as Farm[] ?? []).map((f) => ({
        farmId: f.farmId,
        farmName: f.name,
      })),
    [farmsQuery.data]
  );

  const summaryQuery = useFinancePnlSummary(apiParams);
  const byMonthQuery = useFinancePnlByMonth(apiParams);
  const byFarmQuery = useFinancePnlByFarm(apiParams);
  const byCropQuery = useFinancePnlByCrop(apiParams);
  const arAgingQuery = useFinancePnlArAging(apiParams);
  const revenueSourcesQuery = useFinanceRevenueSources(apiParams);

  const handleCropClick = useCallback(
    (cropName: string) => handleFilterChange({ cropName }),
    [handleFilterChange]
  );

  // Crop search/filter + show-more for Revenue by Crop
  const [pnlCropSearch, setPnlCropSearch] = useState('');
  const [selectedPnlCrops, setSelectedPnlCrops] = useState<Set<string>>(new Set());
  const [pnlCropExpanded, setPnlCropExpanded] = useState(false);

  const allPnlCrops = byCropQuery.data?.crops ?? [];

  const filteredPnlCrops = (() => {
    if (selectedPnlCrops.size > 0) {
      return allPnlCrops.filter((c) => selectedPnlCrops.has(c.cropName));
    }
    return pnlCropExpanded ? allPnlCrops : allPnlCrops.slice(0, REVENUE_CROP_DEFAULT_VISIBLE);
  })();

  const pnlCropSearchResults = pnlCropSearch.trim().length > 0
    ? allPnlCrops
        .filter((c) => c.cropName.toLowerCase().includes(pnlCropSearch.toLowerCase()) && !selectedPnlCrops.has(c.cropName))
        .slice(0, 8)
    : [];

  const togglePnlCrop = (cropName: string) => {
    setSelectedPnlCrops((prev) => {
      const next = new Set(prev);
      if (next.has(cropName)) next.delete(cropName);
      else next.add(cropName);
      return next;
    });
    setPnlCropSearch('');
  };

  const clearPnlCropSelection = () => {
    setSelectedPnlCrops(new Set());
    setPnlCropSearch('');
  };

  return (
    <PnLTabContainer>
      {/* Filters bar — farming year hidden; global sidebar controls it */}
      <PnlFiltersBar
        filters={filters}
        farms={farmOptions}
        farmsLoading={farmsQuery.isLoading}
        onChange={handleFilterChange}
        hideFarmingYear
      />

      <PnlKpiCards
        summary={summaryQuery.data}
        isLoading={summaryQuery.isLoading}
        isError={summaryQuery.isError}
        onRetry={() => summaryQuery.refetch()}
      />

      <PnlRevenueTrendChart
        months={byMonthQuery.data?.months}
        isLoading={byMonthQuery.isLoading}
        isError={byMonthQuery.isError}
        onRetry={() => byMonthQuery.refetch()}
      />

      <PnlBreakdownCharts
        farms={byFarmQuery.data?.farms}
        farmsLoading={byFarmQuery.isLoading}
        farmsError={byFarmQuery.isError}
        crops={filteredPnlCrops}
        cropsLoading={byCropQuery.isLoading}
        cropsError={byCropQuery.isError}
        onFarmClick={undefined}
        onCropClick={handleCropClick}
        onFarmsRetry={() => byFarmQuery.refetch()}
        onCropsRetry={() => byCropQuery.refetch()}
        cropHeader={byCropQuery.data?.crops && byCropQuery.data.crops.length > REVENUE_CROP_DEFAULT_VISIBLE ? (
          <CropFilterBar>
            <CropSearchWrapper>
              <CropSearchInput
                type="text"
                placeholder="Search crops to compare revenue..."
                value={pnlCropSearch}
                onChange={(e) => setPnlCropSearch(e.target.value)}
              />
              {pnlCropSearchResults.length > 0 && (
                <CropSearchDropdown>
                  {pnlCropSearchResults.map((c) => (
                    <CropSearchItem key={c.cropName} onClick={() => togglePnlCrop(c.cropName)}>
                      <span>{c.cropName}</span>
                      <CropSearchItemKpi $color={theme.colors.success}>
                        {c.revenue.toLocaleString('en-US', { maximumFractionDigits: 0 })} AED
                      </CropSearchItemKpi>
                    </CropSearchItem>
                  ))}
                </CropSearchDropdown>
              )}
            </CropSearchWrapper>
            {selectedPnlCrops.size > 0 && (
              <CropChipsRow>
                {[...selectedPnlCrops].map((name) => (
                  <CropChip key={name}>
                    {name}
                    <CropChipRemove onClick={() => togglePnlCrop(name)}>×</CropChipRemove>
                  </CropChip>
                ))}
                <CropChipClear onClick={clearPnlCropSelection}>Clear all</CropChipClear>
              </CropChipsRow>
            )}
          </CropFilterBar>
        ) : undefined}
        cropFooter={byCropQuery.data?.crops && byCropQuery.data.crops.length > REVENUE_CROP_DEFAULT_VISIBLE && selectedPnlCrops.size === 0 ? (
          <ShowMoreButton onClick={() => setPnlCropExpanded((v) => !v)}>
            {pnlCropExpanded ? 'Show top 5 only' : `Show all ${byCropQuery.data.crops.length} crops`}
          </ShowMoreButton>
        ) : undefined}
      />

      <PnlStatementTable
        summary={summaryQuery.data}
        isLoading={summaryQuery.isLoading}
        isError={summaryQuery.isError}
        onRetry={() => summaryQuery.refetch()}
      />

      <PnlArAging
        data={arAgingQuery.data}
        isLoading={arAgingQuery.isLoading}
        isError={arAgingQuery.isError}
        onRetry={() => arAgingQuery.refetch()}
      />

      <PnlRevenueConfidence
        data={revenueSourcesQuery.data}
        isLoading={revenueSourcesQuery.isLoading}
        isError={revenueSourcesQuery.isError}
        onRetry={() => revenueSourcesQuery.refetch()}
      />
    </PnLTabContainer>
  );
}

// ============================================================================
// YIELD KPI CHART (progress-bar style — recharts vertical BarChart)
// ============================================================================

interface YieldKpiChartProps {
  data: FarmYieldKpi[];
}

function YieldKpiChart({ data }: YieldKpiChartProps) {
  const theme = useTheme();
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
        const barColor = pct >= 80 ? theme.colors.success : pct >= 40 ? theme.colors.warning : theme.colors.error;
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
  const theme = useTheme();
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
                  <CropSearchItemKpi $color={c.efficiencyPercent >= 80 ? theme.colors.success : c.efficiencyPercent >= 40 ? theme.colors.warning : theme.colors.error}>
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
          const barColor = pct >= 80 ? theme.colors.success : pct >= 40 ? theme.colors.warning : theme.colors.error;
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
  const theme = useTheme();
  const statusColors: Record<string, string> = {
    pending: theme.colors.error,
    processing: theme.colors.warning,
    delivered: theme.colors.success,
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
            <StatusDot $color={statusColors[row.key] ?? theme.colors.textDisabled} />
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
  /* Night Observatory sky-blocker fix (spec §7): the dashboard is the app's
     landing surface — the fixed Sky layer (mounted once at the app shell)
     must read through it more strongly than anywhere else. The previous
     opaque "canvas" fill here painted directly over the sky on every visit.
     No background at all: PageContainer is transparent, glass widgets below
     float on the sky itself. */

  @media (min-width: ${({ theme }) => theme.breakpoints.tablet}) {
    padding: ${({ theme }) => theme.spacing.lg};
  }

  @media (min-width: ${({ theme }) => theme.breakpoints.desktop}) {
    padding: ${({ theme }) => theme.spacing.xl};
  }
`;

// Actions row (refresh + last-updated + year badge) sits below the shared
// PageHeader — PageHeader itself only has a stat-tile slot, not an
// action-button slot, so this stays a sibling rather than forcing those
// controls into stats.
const HeaderActionsRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
  flex-wrap: wrap;
  margin-bottom: ${({ theme }) => theme.spacing.xl};
`;

const HeaderActionsSpacer = styled.div`
  flex: 1;

  @media (max-width: ${({ theme }) => theme.breakpoints.tablet}) {
    display: none;
  }
`;

/**
 * The dashboard's one deliberate gold accent from the shell's own budget
 * (spec §3): the primary CTA on the landing page. Refresh is the single
 * most prominent, always-visible action on this page, so it carries the
 * gold-gradient primary-button treatment (spec §4 "Buttons").
 */
const RefreshButton = styled.button`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};
  background: linear-gradient(145deg, ${({ theme }) => theme.colors.secondary[400]}, ${({ theme }) => theme.colors.secondary[600]});
  color: ${({ theme }) => theme.colors.onAccent};
  border: none;
  border-radius: 10px;
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: 700;
  cursor: pointer;
  transition: transform 150ms ease-in-out, box-shadow 150ms ease-in-out;
  white-space: nowrap;

  &:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 6px 18px rgba(220, 185, 79, 0.3);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.secondary[500]};
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
    &:hover:not(:disabled) {
      transform: none;
    }
  }
`;

const RefreshIcon = styled.span<{ $spinning: boolean }>`
  display: inline-flex;
  align-items: center;
  animation: ${({ $spinning }) => ($spinning ? spinAnimation : 'none')} 1s linear infinite;
`;

const LastUpdatedText = styled.p`
  ${monoLabel}
  font-size: 0.62rem;
  color: ${({ theme }) => theme.colors.muted};
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

// Night Observatory (T-901): glass hero tiles floating over the sky, left
// edge keeps its categorical accent stripe. Only the primary metric (Farms)
// carries the goldThread top accent (spec §3 — most of the gold budget on
// this page is spent here + the breadcrumb, not on every card).
const HeroCard = styled.article<{ $borderColor: string; $gold: boolean }>`
  ${glassPanel}
  ${({ $gold }) => $gold && goldThread}
  padding: ${({ theme }) => theme.spacing.xl};
  border-left: 4px solid ${({ $borderColor }) => $borderColor};
`;

const KpiValue = styled.p<{ $color?: string }>`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: ${({ theme }) => theme.typography.fontSize['2xl']};
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
  color: ${({ theme, $color }) => $color ?? theme.colors.textPrimary};
  text-shadow: 0 0 22px ${({ $color }) => ($color ? `${$color}66` : 'transparent')};
  margin: 0 0 ${({ theme }) => theme.spacing.xs} 0;
  line-height: ${({ theme }) => theme.typography.lineHeight.tight};
`;

const KpiLabel = styled.p`
  ${monoLabel}
  font-size: 0.66rem;
  color: ${({ theme }) => theme.colors.celeste};
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
  ${glassPanel}
  padding: ${({ theme }) => theme.spacing.xl};
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
  ${monoLabel}
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  font-size: 0.62rem;
  border-radius: ${({ theme }) => theme.borderRadius.full};
  background: rgba(107, 138, 224, 0.16);
  color: ${({ theme }) => theme.colors.bright.lapis};
  border: 1px solid rgba(107, 138, 224, 0.45);
`;

const ChartFilterSelect = styled.select`
  ${glassControl}
  padding: 6px 30px 6px 12px;
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textPrimary};
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
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

/**
 * Semantic border/background per insight type, resolved from the live theme
 * (not module-level constants) via the styled-component's theme callback —
 * success/warning/error/info are theme-invariant, but this keeps the pattern
 * consistent with everything else in this file that reads off `theme`.
 */
function insightBorderColor(type: InsightType, theme: DefaultTheme): string {
  const map: Record<InsightType, string> = {
    success: theme.colors.success,
    warning: theme.colors.warning,
    info: theme.colors.info,
    critical: theme.colors.error,
  };
  return map[type];
}

function insightBgColor(type: InsightType, theme: DefaultTheme): string {
  // Subtle ~6% tint of the semantic hue — matches the hex-alpha idiom used
  // elsewhere in this file (see PnLPeriodBadge below).
  const map: Record<InsightType, string> = {
    success: `${theme.colors.success}0F`,
    warning: `${theme.colors.warning}0F`,
    info: `${theme.colors.info}0F`,
    critical: `${theme.colors.error}0F`,
  };
  return map[type];
}

const InsightsGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: ${({ theme }) => theme.spacing.md};

  @media (min-width: ${({ theme }) => theme.breakpoints.tablet}) {
    grid-template-columns: repeat(2, 1fr);
  }
`;

const InsightCard = styled.article<{ $type: InsightType }>`
  background: ${({ $type, theme }) => insightBgColor($type, theme)};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  padding: ${({ theme }) => theme.spacing.md};
  border-left: 4px solid ${({ $type, theme }) => insightBorderColor($type, theme)};
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
  ${glassControl}
  width: 100%;
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textPrimary};
  transition: border-color 0.15s ease;

  &::placeholder {
    color: ${({ theme }) => theme.colors.muted};
  }

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
`;

// Dropdown popping out of the glass ChartCard above it — glassOpaque per
// spec §2's two-glass-layer rule (an opaque menu, not another blurred panel).
const CropSearchDropdown = styled.div`
  ${glassOpaque}
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 4px;
  border-radius: 10px;
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
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
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
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
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
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
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
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
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
  /* Night Observatory onAccent audit (spec §1.1): error/coral is a bright
     fill, not the gold fill onAccent now means "dark text for" — needs
     onDark (cream), same bug class as the AI Hub/assistant files. */
  color: ${({ theme }) => theme.colors.onDark};
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

// ── Tab bar ─────────────────────────────────────────────────────────────────

const TabBar = styled.div`
  ${glassPanel}
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.sm};
  margin-bottom: ${({ theme }) => theme.spacing.xl};
`;

const TabPill = styled.button<{ $active: boolean }>`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => `${theme.spacing.md} ${theme.spacing.lg}`};
  border: 1px solid ${({ $active, theme }) =>
    $active ? 'rgba(107, 138, 224, 0.4)' : 'transparent'};
  border-radius: 10px;
  font-family: inherit;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  text-align: left;

  background: ${({ $active }) =>
    $active ? 'linear-gradient(90deg, rgba(107, 138, 224, 0.16), rgba(107, 138, 224, 0.04))' : 'transparent'};

  &:hover:not([aria-selected='true']) {
    background: rgba(180, 200, 220, 0.07);
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.secondary[500]};
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const TabIcon = styled.span`
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.colors.bright.lapis};
  flex-shrink: 0;
`;

const TabLabelGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const TabLabel = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const TabHint = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  color: ${({ theme }) => theme.colors.muted};
`;

// ── P&L tab content wrapper ──────────────────────────────────────────────────

const PnLTabContainer = styled.div`
  display: flex;
  flex-direction: column;
`;

const PnLTabHeader = styled.div`
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const PnLTabTitle = styled.h2`
  font-size: ${({ theme }) => theme.typography.fontSize.xl};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 ${({ theme }) => theme.spacing.xs} 0;
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  flex-wrap: wrap;
`;

const PnLPeriodBadge = styled.span`
  display: inline-block;
  background: ${({ theme }) => `${theme.colors.primary[500]}15`};
  color: ${({ theme }) => theme.colors.primary[700]};
  padding: ${({ theme }) => `${theme.spacing.xs} ${theme.spacing.sm}`};
  border-radius: ${({ theme }) => theme.borderRadius.full};
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
`;

const PnLTabSubtitle = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0;
`;
