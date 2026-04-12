/**
 * PnlRevenueTrendChart
 *
 * Monthly area/line chart showing Revenue vs Net Profit over time.
 * Uses Recharts (already in the stack).
 */

import styled, { keyframes } from 'styled-components';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import type { PnlMonthlyDataPoint } from '../../types/finance';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatYAxis(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return `${value}`;
}

function formatTooltipValue(value: number): string {
  return `${value.toLocaleString()} AED`;
}

function formatMonthLabel(yearMonth: string): string {
  // "2024-07" → "Jul 24"
  try {
    const [year, month] = yearMonth.split('-');
    const date = new Date(Number(year), Number(month) - 1, 1);
    return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  } catch {
    return yearMonth;
  }
}

// ─── Styled Components ────────────────────────────────────────────────────────

const shimmer = keyframes`
  0% { background-position: -400px 0; }
  100% { background-position: 400px 0; }
`;

const Section = styled.section`
  background: ${({ theme }) => theme.colors.background};
  border: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  padding: ${({ theme }) => theme.spacing.lg};
  box-shadow: ${({ theme }) => theme.shadows.sm};
  margin-bottom: ${({ theme }) => theme.spacing.xl};
`;

const SectionTitle = styled.h2`
  font-size: ${({ theme }) => theme.typography.fontSize.lg};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 ${({ theme }) => theme.spacing.lg} 0;
`;

const ChartContainer = styled.div`
  height: 300px;

  @media (max-width: ${({ theme }) => theme.breakpoints.tablet}) {
    height: 220px;
  }
`;

const SkeletonBar = styled.div`
  height: 300px;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  background: linear-gradient(
    90deg,
    ${({ theme }) => theme.colors.neutral[200]} 25%,
    ${({ theme }) => theme.colors.neutral[100]} 50%,
    ${({ theme }) => theme.colors.neutral[200]} 75%
  );
  background-size: 800px 100%;
  animation: ${shimmer} 1.5s infinite linear;
`;

const EmptyState = styled.div`
  height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
`;

const ErrorState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.xl};
  color: ${({ theme }) => theme.colors.error};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
`;

const RetryButton = styled.button`
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};
  background: ${({ theme }) => theme.colors.primary[500]};
  color: white;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  cursor: pointer;
  font-family: inherit;

  &:hover {
    background: ${({ theme }) => theme.colors.primary[700]};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary[500]};
    outline-offset: 2px;
  }
`;

// Custom tooltip content
function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div
      style={{
        background: 'white',
        border: '1px solid #e0e0e0',
        borderRadius: '8px',
        padding: '12px',
        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: '8px', fontSize: '14px' }}>
        {label}
      </div>
      {payload.map((entry) => (
        <div
          key={entry.name}
          style={{ color: entry.color, fontSize: '13px', marginBottom: '4px' }}
        >
          {entry.name}: {formatTooltipValue(entry.value)}
        </div>
      ))}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

interface PnlRevenueTrendChartProps {
  months?: PnlMonthlyDataPoint[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

export function PnlRevenueTrendChart({
  months,
  isLoading,
  isError,
  onRetry,
}: PnlRevenueTrendChartProps) {
  return (
    <Section aria-labelledby="trend-chart-title">
      <SectionTitle id="trend-chart-title">Revenue Trend</SectionTitle>

      {isLoading && <SkeletonBar aria-label="Loading revenue trend chart" />}

      {isError && (
        <ErrorState role="alert">
          <span>Failed to load revenue trend data.</span>
          <RetryButton onClick={onRetry}>Retry</RetryButton>
        </ErrorState>
      )}

      {!isLoading && !isError && (!months || months.length === 0) && (
        <EmptyState>No monthly data available for the selected period.</EmptyState>
      )}

      {!isLoading && !isError && months && months.length > 0 && (
        <ChartContainer>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={months.map((m) => ({
                ...m,
                yearMonth: formatMonthLabel(m.yearMonth),
              }))}
              margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorNetProfit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2196f3" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#2196f3" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
              <XAxis
                dataKey="yearMonth"
                tick={{ fontSize: 12, fill: '#616161' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tickFormatter={formatYAxis}
                tick={{ fontSize: 12, fill: '#616161' }}
                tickLine={false}
                axisLine={false}
                width={55}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: '13px', paddingTop: '8px' }}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                name="Revenue"
                stroke="#10B981"
                strokeWidth={2}
                fill="url(#colorRevenue)"
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Area
                type="monotone"
                dataKey="netProfit"
                name="Net Profit"
                stroke="#2196f3"
                strokeWidth={2}
                fill="url(#colorNetProfit)"
                dot={false}
                activeDot={{ r: 4 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartContainer>
      )}
    </Section>
  );
}
