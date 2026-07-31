/**
 * PnlBreakdownCharts
 *
 * Two-column grid with:
 *   Left:  Revenue by Farm  (horizontal bar chart)
 *   Right: Revenue by Crop  (horizontal bar chart, top 10)
 *
 * Clicking a bar fires onFarmClick / onCropClick to update page filters.
 */

import { useState } from 'react';
import styled, { keyframes, useTheme } from 'styled-components';
import { glassPanel, type Theme } from '@a64core/shared';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts';
import type { PnlFarmDataPoint, PnlCropDataPoint } from '../../types/finance';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatAed(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return `${value}`;
}

function formatTooltipValue(value: number): string {
  return `${value.toLocaleString()} AED`;
}

// Categorical bar-fill order — spec §4 "Charts": celeste, bright.gold,
// bright.emerald, bright.lapis, bright.terra, bright.lavender, cycled by
// index. Both bar charts (farm, crop) share this one series order rather
// than each rolling its own ramp — "no rainbow defaults" per spec.
const chartSeries = (theme: Theme) => [
  theme.colors.celeste,
  theme.colors.bright.gold,
  theme.colors.bright.emerald,
  theme.colors.bright.lapis,
  theme.colors.bright.terra,
  theme.colors.bright.lavender,
];

// ─── Styled Components ────────────────────────────────────────────────────────

const shimmer = keyframes`
  0% { background-position: -400px 0; }
  100% { background-position: 400px 0; }
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: ${({ theme }) => theme.spacing.lg};
  margin-bottom: ${({ theme }) => theme.spacing.xl};
  align-items: stretch;

  @media (max-width: ${({ theme }) => theme.breakpoints.tablet}) {
    grid-template-columns: 1fr;
  }
`;

const Panel = styled.section`
  ${glassPanel}
  padding: ${({ theme }) => theme.spacing.lg};
`;

const FarmPanel = styled(Panel)`
  display: flex;
  flex-direction: column;
`;

const PanelTitle = styled.h2`
  font-size: ${({ theme }) => theme.typography.fontSize.lg};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 ${({ theme }) => theme.spacing.lg} 0;
`;

const ChartContainer = styled.div`
  height: 280px;
`;

const FarmChartContainer = styled.div`
  flex: 1;
  min-height: 280px;
`;

const SkeletonBar = styled.div`
  height: 280px;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  background: linear-gradient(
    90deg,
    ${({ theme }) => theme.colors.glass.base} 25%,
    ${({ theme }) => theme.colors.glass.hi} 50%,
    ${({ theme }) => theme.colors.glass.base} 75%
  );
  background-size: 800px 100%;
  animation: ${shimmer} 1.5s infinite linear;
`;

const EmptyState = styled.div`
  height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.colors.muted};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
`;

const ErrorState = styled.div`
  height: 200px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.spacing.md};
  color: ${({ theme }) => theme.colors.error};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
`;

// `primary[500]` is a lapis-b fill — needs `onDark` (cream), not `onAccent`
// (cosmos, reserved for gold fills). See CardValue/CCChip in sibling files
// for the same onAccent-misuse pattern.
const RetryButton = styled.button`
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};
  background: ${({ theme }) => theme.colors.primary[500]};
  color: ${({ theme }) => theme.colors.onDark};
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  cursor: pointer;
  font-family: inherit;

  &:hover {
    background: ${({ theme }) => theme.colors.primary[700]};
  }
`;

const ShowMoreBtn = styled.button`
  display: block;
  width: 100%;
  padding: ${({ theme }) => theme.spacing.sm};
  margin-top: ${({ theme }) => theme.spacing.sm};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  color: ${({ theme }) => theme.colors.primary[300]};
  background: transparent;
  border: 1px dashed ${({ theme }) => theme.colors.line};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s ease;

  &:hover {
    background: ${({ theme }) => theme.colors.glass.hi};
    border-color: ${({ theme }) => theme.colors.primary[500]};
  }
`;

const Hint = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  color: ${({ theme }) => theme.colors.muted};
  margin: ${({ theme }) => theme.spacing.sm} 0 0 0;
`;

// Custom tooltip shared by both charts
function BarTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  const theme = useTheme();
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div
      style={{
        // glassOpaque recipe (mixins.ts), inlined — recharts renders tooltip
        // content outside styled-components' `css` context.
        background: theme.colors.cosmosHi,
        border: `1px solid ${theme.colors.glass.border}`,
        borderRadius: '8px',
        padding: '10px 14px',
        boxShadow: '0 12px 32px rgba(4, 6, 18, 0.5)',
        fontSize: '13px',
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: '4px', color: theme.colors.textPrimary }}>{label}</div>
      <div
        style={{
          fontFamily: theme.typography.fontFamily.mono,
          color: theme.colors.celeste,
        }}
      >
        {formatTooltipValue(payload[0].value)}
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

const FARM_DEFAULT_VISIBLE = 5;

interface PnlBreakdownChartsProps {
  farms?: PnlFarmDataPoint[];
  farmsLoading: boolean;
  farmsError: boolean;
  crops?: PnlCropDataPoint[];
  cropsLoading: boolean;
  cropsError: boolean;
  onFarmClick?: (farmId: string) => void;
  onCropClick?: (cropName: string) => void;
  onFarmsRetry: () => void;
  onCropsRetry: () => void;
  cropHeader?: React.ReactNode;
  cropFooter?: React.ReactNode;
}

export function PnlBreakdownCharts({
  farms,
  farmsLoading,
  farmsError,
  crops,
  cropsLoading,
  cropsError,
  onFarmClick,
  onCropClick,
  onFarmsRetry,
  onCropsRetry,
  cropHeader,
  cropFooter,
}: PnlBreakdownChartsProps) {
  const theme = useTheme();
  const [farmsExpanded, setFarmsExpanded] = useState(false);
  const allFarmsSorted = farms ? [...farms].sort((a, b) => b.revenue - a.revenue) : [];
  const topFarms = farmsExpanded ? allFarmsSorted : allFarmsSorted.slice(0, FARM_DEFAULT_VISIBLE);
  const hasMoreFarms = allFarmsSorted.length > FARM_DEFAULT_VISIBLE;
  const topCrops = crops ? [...crops].sort((a, b) => b.revenue - a.revenue).slice(0, 10) : [];

  return (
    <Row>
      {/* Revenue by Farm */}
      <FarmPanel aria-labelledby="farm-chart-title">
        <PanelTitle id="farm-chart-title">Revenue by Farm</PanelTitle>

        {farmsLoading && <SkeletonBar aria-label="Loading farm revenue chart" />}

        {farmsError && (
          <ErrorState role="alert">
            <span>Failed to load farm data.</span>
            <RetryButton onClick={onFarmsRetry}>Retry</RetryButton>
          </ErrorState>
        )}

        {!farmsLoading && !farmsError && topFarms.length === 0 && (
          <EmptyState>No farm data available.</EmptyState>
        )}

        {!farmsLoading && !farmsError && topFarms.length > 0 && (
          <FarmChartContainer>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={topFarms}
                margin={{ top: 4, right: 24, left: 0, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={theme.colors.line} />
                <XAxis
                  type="number"
                  tickFormatter={formatAed}
                  tick={{ fontSize: 11, fontFamily: theme.typography.fontFamily.mono, fill: theme.colors.muted }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="farmName"
                  width={120}
                  tick={{ fontSize: 11, fontFamily: theme.typography.fontFamily.mono, fill: theme.colors.celeste }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip content={<BarTooltip />} />
                <Bar
                  dataKey="revenue"
                  radius={[0, 4, 4, 0]}
                  cursor={onFarmClick ? 'pointer' : 'default'}
                  onClick={onFarmClick ? (data: PnlFarmDataPoint) => onFarmClick(data.farmId) : undefined}
                >
                  {topFarms.map((_, index) => {
                    const palette = chartSeries(theme);
                    return (
                      <Cell
                        key={`farm-cell-${index}`}
                        fill={palette[index % palette.length]}
                      />
                    );
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </FarmChartContainer>
        )}
        {hasMoreFarms && (
          <ShowMoreBtn onClick={() => setFarmsExpanded((v) => !v)}>
            {farmsExpanded ? 'Show top 5 only' : `Show all ${allFarmsSorted.length} farms`}
          </ShowMoreBtn>
        )}
      </FarmPanel>

      {/* Revenue by Crop */}
      <Panel aria-labelledby="crop-chart-title">
        <PanelTitle id="crop-chart-title">Revenue by Crop</PanelTitle>
        {cropHeader}

        {cropsLoading && <SkeletonBar aria-label="Loading crop revenue chart" />}

        {cropsError && (
          <ErrorState role="alert">
            <span>Failed to load crop data.</span>
            <RetryButton onClick={onCropsRetry}>Retry</RetryButton>
          </ErrorState>
        )}

        {!cropsLoading && !cropsError && topCrops.length === 0 && (
          <EmptyState>No crop data available.</EmptyState>
        )}

        {!cropsLoading && !cropsError && topCrops.length > 0 && (
          <>
            <ChartContainer>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={topCrops}
                  margin={{ top: 4, right: 24, left: 0, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={theme.colors.line} />
                  <XAxis
                    type="number"
                    tickFormatter={formatAed}
                    tick={{ fontSize: 11, fontFamily: theme.typography.fontFamily.mono, fill: theme.colors.muted }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="cropName"
                    width={120}
                    tick={{ fontSize: 11, fontFamily: theme.typography.fontFamily.mono, fill: theme.colors.celeste }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip content={<BarTooltip />} />
                  <Bar
                    dataKey="revenue"
                    radius={[0, 4, 4, 0]}
                    cursor="pointer"
                    onClick={(data: PnlCropDataPoint) => onCropClick(data.cropName)}
                    aria-label="Click to filter by this crop"
                  >
                    {topCrops.map((_, index) => {
                      const palette = chartSeries(theme);
                      return (
                        <Cell
                          key={`crop-cell-${index}`}
                          fill={palette[index % palette.length]}
                        />
                      );
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </>
        )}
        {cropFooter}
      </Panel>
    </Row>
  );
}
