/**
 * CCM Dashboard Page
 *
 * Executive overview across all platform modules.
 * Static tabbed layout — no drag-and-drop, no widget system.
 * Data fetched from:
 *   GET /api/v1/dashboard/summary      (module counts)
 *   GET /api/v1/farm/dashboard/summary  (farm analytics — optional, may fail gracefully)
 */

import { useState, useEffect, useCallback } from 'react';
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
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { apiClient } from '../../services/api';

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

type TabId = 'overview' | 'operations' | 'business';

interface KpiCardConfig {
  label: string;
  borderColor: string;
  getValue: (data: DashboardSummary) => number;
  getSubtitle: (data: DashboardSummary) => string;
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

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'operations', label: 'Operations' },
  { id: 'business', label: 'Business' },
];

const KPI_CARDS: KpiCardConfig[] = [
  {
    label: 'Farms',
    borderColor: MODULE_COLORS.farms,
    getValue: (d) => d.farms.total,
    getSubtitle: (d) =>
      d.farms.active !== null ? `${d.farms.active} active` : `${d.farms.total} total`,
  },
  {
    label: 'Blocks',
    borderColor: MODULE_COLORS.blocks,
    getValue: (d) => d.blocks.total,
    getSubtitle: (d) => {
      const det = d.blocks.details;
      if (det) {
        const parts: string[] = [];
        if (det.growing) parts.push(`${det.growing} growing`);
        if (det.harvesting) parts.push(`${det.harvesting} harvesting`);
        return parts.join(', ') || `${d.blocks.active ?? d.blocks.total} active`;
      }
      return d.blocks.active !== null ? `${d.blocks.active} active` : '';
    },
  },
  {
    label: 'Employees',
    borderColor: MODULE_COLORS.employees,
    getValue: (d) => d.employees.total,
    getSubtitle: (d) =>
      d.employees.active !== null ? `${d.employees.active} active` : `${d.employees.total} total`,
  },
  {
    label: 'Customers',
    borderColor: MODULE_COLORS.customers,
    getValue: (d) => d.customers.total,
    getSubtitle: (d) =>
      d.customers.active !== null ? `${d.customers.active} active` : `${d.customers.total} total`,
  },
  {
    label: 'Orders',
    borderColor: MODULE_COLORS.orders,
    getValue: (d) => d.orders.total,
    getSubtitle: (d) => {
      const det = d.orders.details;
      if (det) {
        const parts: string[] = [];
        if (det.processing) parts.push(`${det.processing} processing`);
        if (det.delivered) parts.push(`${det.delivered} delivered`);
        return parts.join(', ') || `${d.orders.total} total`;
      }
      return `${d.orders.total} total`;
    },
  },
  {
    label: 'Vehicles',
    borderColor: MODULE_COLORS.vehicles,
    getValue: (d) => d.vehicles.total,
    getSubtitle: (d) => {
      const det = d.vehicles.details;
      if (det) {
        const parts: string[] = [];
        if (det.available !== undefined) parts.push(`${det.available} available`);
        if (det.in_use) parts.push(`${det.in_use} in use`);
        return parts.join(', ') || `${d.vehicles.active ?? d.vehicles.total} active`;
      }
      return d.vehicles.active !== null ? `${d.vehicles.active} active` : '';
    },
  },
  {
    label: 'Shipments',
    borderColor: MODULE_COLORS.shipments,
    getValue: (d) => d.shipments.total,
    getSubtitle: (d) => {
      const det = d.shipments.details;
      if (det?.delivered) return `${det.delivered} delivered`;
      return `${d.shipments.total} total`;
    },
  },
  {
    label: 'Campaigns',
    borderColor: MODULE_COLORS.campaigns,
    getValue: (d) => d.campaigns.total,
    getSubtitle: (d) =>
      d.campaigns.active !== null ? `${d.campaigns.active} active` : `${d.campaigns.total} total`,
  },
  {
    label: 'Users',
    borderColor: MODULE_COLORS.users,
    getValue: (d) => d.users.total,
    getSubtitle: (d) =>
      d.users.active !== null ? `${d.users.active} active` : `${d.users.total} total`,
  },
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
// COMPONENT
// ============================================================================

export function Dashboard() {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [farmData, setFarmData] = useState<FarmSummaryData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [summaryRes, farmRes] = await Promise.all([
        apiClient.get<DashboardSummary>('/v1/dashboard/summary'),
        apiClient
          .get<FarmSummaryResponse>('/v1/farm/dashboard/summary')
          .catch(() => null),
      ]);

      setData(summaryRes.data);
      if (farmRes?.data?.success && farmRes.data.data) {
        setFarmData(farmRes.data.data);
      } else {
        setFarmData(null);
      }
    } catch (err) {
      setError('Failed to load dashboard data. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

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

  const orderChartData = data?.orders.details
    ? Object.entries(data.orders.details)
        .filter(([, value]) => value > 0)
        .map(([key, value]) => ({
          name: key.charAt(0).toUpperCase() + key.slice(1),
          count: value,
          fill: key === 'delivered' ? '#10B981' : key === 'processing' ? '#F59E0B' : '#3B82F6',
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

  const cropDistributionData = farmData
    ? farmData.cropBreakdown
        .filter((c) => c.blockCount > 0)
        .sort((a, b) => b.blockCount - a.blockCount)
        .map((c, i) => ({
          name: c.cropName,
          value: c.blockCount,
          color: CROP_PALETTE[i % CROP_PALETTE.length],
        }))
    : [];

  // Stacked bar chart: blocks by state per farm
  const farmBlockDistributionData = farmData
    ? farmData.blocksByFarm
        .filter((f) => f.totalBlocks > 0)
        .map((f) => ({
          name: f.farmName,
          Growing: f.growing,
          Fruiting: f.fruiting,
          Harvesting: f.harvesting,
          Planned: f.planned,
          Empty: f.empty,
          Cleaning: f.cleaning,
          Alert: f.alert,
          Partial: f.partial,
        }))
    : [];

  const insights = data ? generateInsights(data, farmData) : [];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <PageContainer>
      {/* Header */}
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

      {/* Content */}
      {!isLoading && !error && data && (
        <>
          {/* Tab Bar */}
          <TabList role="tablist" aria-label="Dashboard sections">
            {TABS.map((tab) => (
              <TabButton
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls={`tabpanel-${tab.id}`}
                id={`tab-${tab.id}`}
                $active={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </TabButton>
            ))}
          </TabList>

          {/* Tab Panels */}
          <div
            id="tabpanel-overview"
            role="tabpanel"
            aria-labelledby="tab-overview"
            hidden={activeTab !== 'overview'}
          >
            {activeTab === 'overview' && (
              <OverviewTab data={data} insights={insights} />
            )}
          </div>

          <div
            id="tabpanel-operations"
            role="tabpanel"
            aria-labelledby="tab-operations"
            hidden={activeTab !== 'operations'}
          >
            {activeTab === 'operations' && (
              <OperationsTab
                data={data}
                blockChartData={blockChartData}
                harvestByFarmData={harvestByFarmData}
                cropDistributionData={cropDistributionData}
                farmBlockDistributionData={farmBlockDistributionData}
                hasFarmData={farmData !== null}
              />
            )}
          </div>

          <div
            id="tabpanel-business"
            role="tabpanel"
            aria-labelledby="tab-business"
            hidden={activeTab !== 'business'}
          >
            {activeTab === 'business' && (
              <BusinessTab data={data} orderChartData={orderChartData} />
            )}
          </div>
        </>
      )}
    </PageContainer>
  );
}

// ============================================================================
// TAB: OVERVIEW
// ============================================================================

interface OverviewTabProps {
  data: DashboardSummary;
  insights: Insight[];
}

function OverviewTab({ data, insights }: OverviewTabProps) {
  return (
    <TabContent>
      <SectionTitle>Key Performance Indicators</SectionTitle>
      <KpiGrid>
        {KPI_CARDS.map((card) => (
          <KpiCard key={card.label} $borderColor={card.borderColor}>
            <KpiLabel>{card.label}</KpiLabel>
            <KpiValue>{formatNumber(card.getValue(data))}</KpiValue>
            <KpiSubtitle>{card.getSubtitle(data)}</KpiSubtitle>
          </KpiCard>
        ))}
      </KpiGrid>

      {insights.length > 0 && (
        <InsightsSection aria-label="Key insights">
          <SectionTitle>Key Insights</SectionTitle>
          <InsightsGrid>
            {insights.map((insight, i) => (
              <InsightCard key={i} $type={insight.type} role="article">
                <InsightTitle>{insight.title}</InsightTitle>
                <InsightDescription>{insight.description}</InsightDescription>
              </InsightCard>
            ))}
          </InsightsGrid>
        </InsightsSection>
      )}
    </TabContent>
  );
}

// ============================================================================
// TAB: OPERATIONS
// ============================================================================

interface ChartEntry {
  name: string;
  value: number;
  color: string;
}

interface HarvestByFarmEntry {
  name: string;
  kg: number;
  harvests: number;
}

interface FarmBlockEntry {
  name: string;
  [state: string]: string | number;
}

interface OperationsTabProps {
  data: DashboardSummary;
  blockChartData: ChartEntry[];
  harvestByFarmData: HarvestByFarmEntry[];
  cropDistributionData: ChartEntry[];
  farmBlockDistributionData: FarmBlockEntry[];
  hasFarmData: boolean;
}

function OperationsTab({
  data,
  blockChartData,
  harvestByFarmData,
  cropDistributionData,
  farmBlockDistributionData,
  hasFarmData,
}: OperationsTabProps) {
  return (
    <TabContent>
      {/* Row 1: Block Status Donut + Crop Distribution */}
      <ChartRow>
        {/* Block Status Donut Chart */}
        <ChartCard>
          <CardTitle>Block Status Distribution</CardTitle>
          {blockChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={blockChartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={110}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {blockChartData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number) => [formatNumber(value), 'Blocks']}
                />
                <Legend
                  formatter={(value) => <LegendLabel>{value}</LegendLabel>}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <NoDataText>No block status data available</NoDataText>
          )}
        </ChartCard>

        {/* Crop Distribution Donut */}
        {hasFarmData && (
          <ChartCard>
            <CardTitle>Crop Distribution</CardTitle>
            {cropDistributionData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={cropDistributionData}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={110}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {cropDistributionData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => [formatNumber(value), 'Blocks']}
                  />
                  <Legend
                    formatter={(value) => <LegendLabel>{value}</LegendLabel>}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <NoDataText>No crop data available</NoDataText>
            )}
          </ChartCard>
        )}
      </ChartRow>

      {/* Row 2: Harvest by Farm (full width) */}
      {hasFarmData && (
        <ChartCard>
          <CardTitle>Harvest by Farm (kg)</CardTitle>
          {harvestByFarmData.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(200, harvestByFarmData.length * 48)}>
              <BarChart
                data={harvestByFarmData}
                layout="vertical"
                margin={{ top: 8, right: 32, left: 16, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 12 }}
                  tickFormatter={(v: number) => formatNumber(v)}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 13 }}
                  width={120}
                />
                <Tooltip
                  formatter={(value: number, name: string) => {
                    if (name === 'kg') return [formatKg(value), 'Total Harvested'];
                    return [formatNumber(value), 'Harvests'];
                  }}
                />
                <Bar dataKey="kg" fill="#10B981" radius={[0, 4, 4, 0]} name="kg" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <NoDataText>No harvest data available across farms</NoDataText>
          )}
        </ChartCard>
      )}

      {/* Row 3: Farm Block Distribution stacked bar (full width) */}
      {hasFarmData && farmBlockDistributionData.length > 0 && (
        <ChartCard>
          <CardTitle>Block Distribution by Farm</CardTitle>
          <ResponsiveContainer
            width="100%"
            height={Math.max(240, farmBlockDistributionData.length * 52)}
          >
            <BarChart
              data={farmBlockDistributionData}
              layout="vertical"
              margin={{ top: 8, right: 32, left: 16, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 12 }} />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 13 }}
                width={120}
              />
              <Tooltip formatter={(value: number) => [formatNumber(value), 'Blocks']} />
              <Legend formatter={(value) => <LegendLabel>{value}</LegendLabel>} />
              {['Growing', 'Fruiting', 'Harvesting', 'Planned', 'Cleaning', 'Alert', 'Partial', 'Empty'].map(
                (state) => (
                  <Bar
                    key={state}
                    dataKey={state}
                    stackId="blocks"
                    fill={BLOCK_STATE_COLORS[state.toLowerCase()] ?? '#9E9E9E'}
                  />
                )
              )}
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Row 4: Detail summary cards */}
      <OperationsSummaryGrid>
        <SummaryCard>
          <SummaryCardTitle>Farms</SummaryCardTitle>
          <SummaryRow>
            <SummaryLabel>Total</SummaryLabel>
            <SummaryValue>{formatNumber(data.farms.total)}</SummaryValue>
          </SummaryRow>
          {data.farms.active !== null && (
            <SummaryRow>
              <SummaryLabel>Active</SummaryLabel>
              <SummaryValue $accent={MODULE_COLORS.farms}>
                {formatNumber(data.farms.active)}
              </SummaryValue>
            </SummaryRow>
          )}
        </SummaryCard>

        <SummaryCard>
          <SummaryCardTitle>Blocks</SummaryCardTitle>
          <SummaryRow>
            <SummaryLabel>Total</SummaryLabel>
            <SummaryValue>{formatNumber(data.blocks.total)}</SummaryValue>
          </SummaryRow>
          {data.blocks.active !== null && (
            <SummaryRow>
              <SummaryLabel>Active</SummaryLabel>
              <SummaryValue $accent={MODULE_COLORS.blocks}>
                {formatNumber(data.blocks.active)}
              </SummaryValue>
            </SummaryRow>
          )}
          {data.blocks.details &&
            Object.entries(data.blocks.details).map(([key, val]) => (
              <SummaryRow key={key}>
                <SummaryLabel>
                  <StatusDot $color={BLOCK_STATE_COLORS[key] ?? '#9E9E9E'} />
                  {key.charAt(0).toUpperCase() + key.slice(1)}
                </SummaryLabel>
                <SummaryValue>{formatNumber(val)}</SummaryValue>
              </SummaryRow>
            ))}
        </SummaryCard>

        <SummaryCard>
          <SummaryCardTitle>Vehicles</SummaryCardTitle>
          <SummaryRow>
            <SummaryLabel>Total</SummaryLabel>
            <SummaryValue>{formatNumber(data.vehicles.total)}</SummaryValue>
          </SummaryRow>
          {data.vehicles.details?.available !== undefined && (
            <SummaryRow>
              <SummaryLabel>Available</SummaryLabel>
              <SummaryValue $accent={MODULE_COLORS.vehicles}>
                {formatNumber(data.vehicles.details.available)}
              </SummaryValue>
            </SummaryRow>
          )}
          {data.vehicles.details?.in_use !== undefined && (
            <SummaryRow>
              <SummaryLabel>In Use</SummaryLabel>
              <SummaryValue>{formatNumber(data.vehicles.details.in_use)}</SummaryValue>
            </SummaryRow>
          )}
        </SummaryCard>

        <SummaryCard>
          <SummaryCardTitle>Shipments</SummaryCardTitle>
          <SummaryRow>
            <SummaryLabel>Total</SummaryLabel>
            <SummaryValue>{formatNumber(data.shipments.total)}</SummaryValue>
          </SummaryRow>
          {data.shipments.details &&
            Object.entries(data.shipments.details).map(([key, val]) => (
              <SummaryRow key={key}>
                <SummaryLabel>{key.charAt(0).toUpperCase() + key.slice(1)}</SummaryLabel>
                <SummaryValue $accent={MODULE_COLORS.shipments}>
                  {formatNumber(val)}
                </SummaryValue>
              </SummaryRow>
            ))}
        </SummaryCard>
      </OperationsSummaryGrid>
    </TabContent>
  );
}

// ============================================================================
// TAB: BUSINESS
// ============================================================================

interface OrderChartEntry {
  name: string;
  count: number;
  fill: string;
}

interface BusinessTabProps {
  data: DashboardSummary;
  orderChartData: OrderChartEntry[];
}

function BusinessTab({ data, orderChartData }: BusinessTabProps) {
  // Derive workforce insights from summary data
  const workforceInsights: Insight[] = [];

  if (data.employees.active !== null && data.employees.active < data.employees.total) {
    const inactive = data.employees.total - data.employees.active;
    workforceInsights.push({
      title: 'Inactive Employees',
      description: `${formatNumber(inactive)} of ${formatNumber(data.employees.total)} employees are currently inactive.`,
      type: 'warning',
    });
  }

  if (data.campaigns.active !== null && data.campaigns.active > 0) {
    workforceInsights.push({
      title: 'Active Marketing Campaigns',
      description: `${formatNumber(data.campaigns.active)} marketing ${
        data.campaigns.active === 1 ? 'campaign is' : 'campaigns are'
      } currently running.`,
      type: 'success',
    });
  }

  return (
    <TabContent>
      <TwoColumnLayout>
        {/* Order Status Chart */}
        <ChartCard>
          <CardTitle>Order Status Distribution</CardTitle>
          {orderChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart
                data={orderChartData}
                layout="vertical"
                margin={{ top: 8, right: 24, left: 16, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 13 }} width={90} />
                <Tooltip formatter={(value: number) => [formatNumber(value), 'Orders']} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {orderChartData.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <NoDataText>No order status data available</NoDataText>
          )}
        </ChartCard>

        {/* Business Summary */}
        <SummaryColumn>
          <SummaryCard>
            <SummaryCardTitle>Customers</SummaryCardTitle>
            <SummaryRow>
              <SummaryLabel>Total</SummaryLabel>
              <SummaryValue>{formatNumber(data.customers.total)}</SummaryValue>
            </SummaryRow>
            {data.customers.active !== null && (
              <SummaryRow>
                <SummaryLabel>Active</SummaryLabel>
                <SummaryValue $accent={MODULE_COLORS.customers}>
                  {formatNumber(data.customers.active)}
                </SummaryValue>
              </SummaryRow>
            )}
          </SummaryCard>

          <SummaryCard>
            <SummaryCardTitle>Orders</SummaryCardTitle>
            <SummaryRow>
              <SummaryLabel>Total</SummaryLabel>
              <SummaryValue>{formatNumber(data.orders.total)}</SummaryValue>
            </SummaryRow>
            {data.orders.details &&
              Object.entries(data.orders.details).map(([key, val]) => (
                <SummaryRow key={key}>
                  <SummaryLabel>{key.charAt(0).toUpperCase() + key.slice(1)}</SummaryLabel>
                  <SummaryValue>{formatNumber(val)}</SummaryValue>
                </SummaryRow>
              ))}
          </SummaryCard>

          <SummaryCard>
            <SummaryCardTitle>Campaigns</SummaryCardTitle>
            <SummaryRow>
              <SummaryLabel>Total</SummaryLabel>
              <SummaryValue>{formatNumber(data.campaigns.total)}</SummaryValue>
            </SummaryRow>
            {data.campaigns.active !== null && (
              <SummaryRow>
                <SummaryLabel>Active</SummaryLabel>
                <SummaryValue $accent={MODULE_COLORS.campaigns}>
                  {formatNumber(data.campaigns.active)}
                </SummaryValue>
              </SummaryRow>
            )}
          </SummaryCard>
        </SummaryColumn>
      </TwoColumnLayout>

      {/* Workforce Insights */}
      {workforceInsights.length > 0 && (
        <WorkforceInsightsSection aria-label="Workforce insights">
          <SectionTitle>Workforce Insights</SectionTitle>
          <InsightsGrid>
            {workforceInsights.map((insight, i) => (
              <InsightCard key={i} $type={insight.type} role="article">
                <InsightTitle>{insight.title}</InsightTitle>
                <InsightDescription>{insight.description}</InsightDescription>
              </InsightCard>
            ))}
          </InsightsGrid>
        </WorkforceInsightsSection>
      )}

      {/* Workforce & Users Section */}
      <WorkforceSection>
        <SectionTitle>Workforce &amp; Users</SectionTitle>
        <WorkforceGrid>
          <SummaryCard>
            <SummaryCardTitle>Employees</SummaryCardTitle>
            <SummaryRow>
              <SummaryLabel>Total</SummaryLabel>
              <SummaryValue>{formatNumber(data.employees.total)}</SummaryValue>
            </SummaryRow>
            {data.employees.active !== null && (
              <SummaryRow>
                <SummaryLabel>Active</SummaryLabel>
                <SummaryValue $accent={MODULE_COLORS.employees}>
                  {formatNumber(data.employees.active)}
                </SummaryValue>
              </SummaryRow>
            )}
          </SummaryCard>

          <SummaryCard>
            <SummaryCardTitle>System Users</SummaryCardTitle>
            <SummaryRow>
              <SummaryLabel>Total</SummaryLabel>
              <SummaryValue>{formatNumber(data.users.total)}</SummaryValue>
            </SummaryRow>
            {data.users.active !== null && (
              <SummaryRow>
                <SummaryLabel>Active</SummaryLabel>
                <SummaryValue $accent={MODULE_COLORS.users}>
                  {formatNumber(data.users.active)}
                </SummaryValue>
              </SummaryRow>
            )}
          </SummaryCard>
        </WorkforceGrid>
      </WorkforceSection>
    </TabContent>
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

// ── Tab Navigation ─────────────────────────────────────────────────────────

const TabList = styled.div`
  display: flex;
  gap: 0;
  border-bottom: 2px solid ${({ theme }) => theme.colors.neutral[300]};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
`;

const TabButton = styled.button<{ $active: boolean }>`
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.lg}`};
  background: none;
  border: none;
  border-bottom: 3px solid
    ${({ theme, $active }) => ($active ? theme.colors.primary[500] : 'transparent')};
  margin-bottom: -2px;
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme, $active }) =>
    $active
      ? theme.typography.fontWeight.semibold
      : theme.typography.fontWeight.regular};
  color: ${({ theme, $active }) =>
    $active ? theme.colors.primary[500] : theme.colors.textSecondary};
  cursor: pointer;
  white-space: nowrap;
  transition: color 150ms ease-in-out, border-color 150ms ease-in-out;

  &:hover:not([aria-selected='true']) {
    color: ${({ theme }) => theme.colors.textPrimary};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary[500]};
    outline-offset: -2px;
    border-radius: ${({ theme }) => theme.borderRadius.sm} ${({ theme }) => theme.borderRadius.sm} 0 0;
  }
`;

// ── Tab Content ────────────────────────────────────────────────────────────

const TabContent = styled.section`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.lg};
  animation: fadeIn 200ms ease-in-out;

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
`;

// ── Section ────────────────────────────────────────────────────────────────

const SectionTitle = styled.h2`
  font-size: ${({ theme }) => theme.typography.fontSize.lg};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 ${({ theme }) => theme.spacing.md} 0;
`;

// ── KPI Cards ──────────────────────────────────────────────────────────────

const KpiGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: ${({ theme }) => theme.spacing.md};

  @media (min-width: ${({ theme }) => theme.breakpoints.tablet}) {
    grid-template-columns: repeat(2, 1fr);
  }

  @media (min-width: ${({ theme }) => theme.breakpoints.desktop}) {
    grid-template-columns: repeat(3, 1fr);
  }
`;

const KpiCard = styled.article<{ $borderColor: string }>`
  background: ${({ theme }) => theme.colors.background};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  padding: ${({ theme }) => theme.spacing.lg};
  box-shadow: ${({ theme }) => theme.shadows.md};
  border-left: 4px solid ${({ $borderColor }) => $borderColor};
  transition: box-shadow 150ms ease-in-out;

  &:hover {
    box-shadow: ${({ theme }) => theme.shadows.lg};
  }
`;

const KpiLabel = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  color: ${({ theme }) => theme.colors.textSecondary};
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0 0 ${({ theme }) => theme.spacing.xs} 0;
`;

const KpiValue = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSize['3xl']};
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 ${({ theme }) => theme.spacing.xs} 0;
  line-height: ${({ theme }) => theme.typography.lineHeight.tight};
`;

const KpiSubtitle = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0;
`;

// ── Insights ───────────────────────────────────────────────────────────────

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

const InsightsSection = styled.section``;

const InsightsGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: ${({ theme }) => theme.spacing.md};

  @media (min-width: ${({ theme }) => theme.breakpoints.tablet}) {
    grid-template-columns: repeat(2, 1fr);
  }

  @media (min-width: ${({ theme }) => theme.breakpoints.desktop}) {
    grid-template-columns: repeat(3, 1fr);
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

// ── Chart layouts ──────────────────────────────────────────────────────────

const ChartRow = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: ${({ theme }) => theme.spacing.lg};

  @media (min-width: ${({ theme }) => theme.breakpoints.desktop}) {
    grid-template-columns: 1fr 1fr;
    align-items: start;
  }
`;

// ── Two-column Layout ──────────────────────────────────────────────────────

const TwoColumnLayout = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: ${({ theme }) => theme.spacing.lg};

  @media (min-width: ${({ theme }) => theme.breakpoints.desktop}) {
    grid-template-columns: 1fr 1fr;
    align-items: start;
  }
`;

// ── Charts ─────────────────────────────────────────────────────────────────

const ChartCard = styled.div`
  background: ${({ theme }) => theme.colors.background};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  padding: ${({ theme }) => theme.spacing.lg};
  box-shadow: ${({ theme }) => theme.shadows.md};
`;

const CardTitle = styled.h3`
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 ${({ theme }) => theme.spacing.md} 0;
`;

const LegendLabel = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

// ── Operations Summary Grid ─────────────────────────────────────────────────

const OperationsSummaryGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: ${({ theme }) => theme.spacing.md};

  @media (min-width: ${({ theme }) => theme.breakpoints.tablet}) {
    grid-template-columns: repeat(2, 1fr);
  }

  @media (min-width: ${({ theme }) => theme.breakpoints.desktop}) {
    grid-template-columns: repeat(4, 1fr);
  }
`;

// ── Summary Cards ──────────────────────────────────────────────────────────

const SummaryColumn = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const SummaryCard = styled.div`
  background: ${({ theme }) => theme.colors.background};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  padding: ${({ theme }) => theme.spacing.lg};
  box-shadow: ${({ theme }) => theme.shadows.sm};
`;

const SummaryCardTitle = styled.h3`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textSecondary};
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0 0 ${({ theme }) => theme.spacing.sm} 0;
  padding-bottom: ${({ theme }) => theme.spacing.sm};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[200]};
`;

const SummaryRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: ${({ theme }) => `${theme.spacing.xs} 0`};

  & + & {
    border-top: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  }
`;

const SummaryLabel = styled.span`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const SummaryValue = styled.span<{ $accent?: string }>`
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme, $accent }) => $accent ?? theme.colors.textPrimary};
`;

const StatusDot = styled.span<{ $color: string }>`
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: ${({ theme }) => theme.borderRadius.full};
  background: ${({ $color }) => $color};
  flex-shrink: 0;
`;

// ── Workforce Section ──────────────────────────────────────────────────────

const WorkforceInsightsSection = styled.section``;

const WorkforceSection = styled.section``;

const WorkforceGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: ${({ theme }) => theme.spacing.md};

  @media (min-width: ${({ theme }) => theme.breakpoints.tablet}) {
    grid-template-columns: repeat(2, 1fr);
  }
`;

// ── Loading & Error ────────────────────────────────────────────────────────

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
