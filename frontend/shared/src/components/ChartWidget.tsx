import styled, { useTheme } from 'styled-components';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { BarChart3, AlertTriangle, RefreshCw } from 'lucide-react';
import type { CCMWidget, ChartWidgetData } from '../types/widget.types';
import { glassPanel } from '../theme/mixins';
import { Spinner } from './common/Spinner';

export interface ChartWidgetProps {
  widget: CCMWidget & { chartType?: 'line' | 'bar' | 'pie' };
  data: ChartWidgetData | null;
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
}

export function ChartWidget({ widget, data, loading, error, onRefresh }: ChartWidgetProps) {
  const theme = useTheme();
  const chartType = widget.chartType || 'line';

  const renderChart = () => {
    if (!data || !data.data || data.data.length === 0) {
      return (
        <EmptyState>
          <EmptyIcon><BarChart3 size={32} strokeWidth={1.6} /></EmptyIcon>
          <EmptyText>No data available</EmptyText>
        </EmptyState>
      );
    }

    // Fallback qualitative palette when the caller doesn't supply per-series
    // colors — spec §4 "Charts" series order (celeste, gold, emerald, lapis,
    // terra, lavender). Gold appears here only as the SECOND series colour in
    // a cycling categorical palette, not as a status/emphasis colour — it is
    // the spec's own prescribed order, not a gold-discipline violation.
    const colors = data.series?.map(s => s.color) || [
      theme.colors.celeste,
      theme.colors.bright.gold,
      theme.colors.bright.emerald,
      theme.colors.bright.lapis,
      theme.colors.bright.terra,
      theme.colors.bright.lavender,
    ];

    switch (chartType) {
      case 'line':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.data}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.colors.line} />
              <XAxis
                dataKey={data.xKey}
                stroke={theme.colors.line}
                tick={{ fill: theme.colors.muted, fontFamily: theme.typography.fontFamily.mono, fontSize: 11 }}
              />
              <YAxis
                stroke={theme.colors.line}
                tick={{ fill: theme.colors.muted, fontFamily: theme.typography.fontFamily.mono, fontSize: 11 }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: theme.colors.cosmosHi,
                  border: `1px solid ${theme.colors.glass.border}`,
                  borderRadius: '0.75rem',
                  boxShadow: '0 12px 32px rgba(4, 6, 18, 0.5)',
                  color: theme.colors.textPrimary,
                }}
                labelStyle={{ color: theme.colors.celeste }}
              />
              <Legend />
              {data.series ? (
                data.series.map((series) => (
                  <Line
                    key={series.dataKey}
                    type="monotone"
                    dataKey={series.dataKey}
                    stroke={series.color}
                    strokeWidth={2}
                    name={series.name}
                    dot={{ r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                ))
              ) : (
                <Line
                  type="monotone"
                  dataKey={data.yKey}
                  stroke={colors[0]}
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        );

      case 'bar':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.data}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.colors.line} />
              <XAxis
                dataKey={data.xKey}
                stroke={theme.colors.line}
                tick={{ fill: theme.colors.muted, fontFamily: theme.typography.fontFamily.mono, fontSize: 11 }}
              />
              <YAxis
                stroke={theme.colors.line}
                tick={{ fill: theme.colors.muted, fontFamily: theme.typography.fontFamily.mono, fontSize: 11 }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: theme.colors.cosmosHi,
                  border: `1px solid ${theme.colors.glass.border}`,
                  borderRadius: '0.75rem',
                  boxShadow: '0 12px 32px rgba(4, 6, 18, 0.5)',
                  color: theme.colors.textPrimary,
                }}
                labelStyle={{ color: theme.colors.celeste }}
              />
              <Legend />
              {data.series ? (
                data.series.map((series) => (
                  <Bar
                    key={series.dataKey}
                    dataKey={series.dataKey}
                    fill={series.color}
                    name={series.name}
                    radius={[4, 4, 0, 0]}
                  />
                ))
              ) : (
                <Bar dataKey={data.yKey} fill={colors[0]} radius={[4, 4, 0, 0]} />
              )}
            </BarChart>
          </ResponsiveContainer>
        );

      case 'pie':
        const pieData = data.data.map((item, index) => ({
          ...item,
          color: colors[index % colors.length],
        }));

        return (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                dataKey={data.yKey}
                nameKey={data.xKey}
                cx="50%"
                cy="50%"
                outerRadius={80}
                label={(entry) => entry[data.xKey]}
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: theme.colors.cosmosHi,
                  border: `1px solid ${theme.colors.glass.border}`,
                  borderRadius: '0.75rem',
                  boxShadow: '0 12px 32px rgba(4, 6, 18, 0.5)',
                  color: theme.colors.textPrimary,
                }}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        );

      default:
        return <EmptyText>Unsupported chart type</EmptyText>;
    }
  };

  return (
    <WidgetCard>
      <WidgetHeader>
        <WidgetHeaderLeft>
          {widget.icon && <Icon>{widget.icon}</Icon>}
          <WidgetTitle>{widget.title}</WidgetTitle>
        </WidgetHeaderLeft>
        {onRefresh && (
          <RefreshButton onClick={onRefresh} disabled={loading} aria-label={`Refresh ${widget.title}`}>
            <RefreshCw size={14} strokeWidth={1.8} />
          </RefreshButton>
        )}
      </WidgetHeader>

      {widget.description && <WidgetDescription>{widget.description}</WidgetDescription>}

      <ChartContainer>
        {loading ? (
          <LoadingContainer>
            <Spinner size="medium" />
            <LoadingText>Loading chart...</LoadingText>
          </LoadingContainer>
        ) : error ? (
          <ErrorContainer>
            <ErrorIcon><AlertTriangle size={28} strokeWidth={1.6} /></ErrorIcon>
            <ErrorText>{error}</ErrorText>
            {onRefresh && <RetryButton onClick={onRefresh}>Retry</RetryButton>}
          </ErrorContainer>
        ) : (
          renderChart()
        )}
      </ChartContainer>
    </WidgetCard>
  );
}

const WidgetCard = styled.div`
  ${glassPanel}
  padding: 1rem;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;

  @media (min-width: 768px) {
    padding: 1.25rem;
  }

  @media (min-width: 1024px) {
    padding: 1.5rem;
  }
`;

const WidgetHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 0.75rem;
`;

const WidgetHeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
`;

const Icon = styled.span`
  font-size: 1.25rem;
`;

const WidgetTitle = styled.h3`
  font-size: 1rem;
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  @media (min-width: 768px) {
    font-size: 1.125rem;
  }
`;

const WidgetDescription = styled.p`
  font-size: 0.75rem;
  color: ${({ theme }) => theme.colors.celeste};
  margin: 0 0 0.75rem 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  @media (min-width: 768px) {
    font-size: 0.875rem;
  }
`;

const RefreshButton = styled.button`
  display: flex;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0.25rem;
  color: ${({ theme }) => theme.colors.muted};
  transition: color 0.2s ease;

  &:hover:not(:disabled) {
    color: ${({ theme }) => theme.colors.celeste};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const ChartContainer = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 240px;

  @media (min-width: 768px) {
    min-height: 280px;
  }

  @media (min-width: 1024px) {
    min-height: 320px;
  }
`;

const LoadingContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
`;

const LoadingText = styled.p`
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.celeste};
  margin: 0;
`;

const ErrorContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  text-align: center;
`;

const ErrorIcon = styled.div`
  display: flex;
  color: ${({ theme }) => theme.colors.error};
`;

const ErrorText = styled.p`
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.error};
  margin: 0;
`;

const RetryButton = styled.button`
  padding: 0.5rem 1rem;
  background: ${({ theme }) => theme.colors.glass.base};
  color: ${({ theme }) => theme.colors.textPrimary};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: 0.875rem;
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  cursor: pointer;
  transition: background 0.2s ease;

  &:hover {
    background: ${({ theme }) => theme.colors.glass.hi};
  }
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
`;

const EmptyIcon = styled.div`
  display: flex;
  color: ${({ theme }) => theme.colors.muted};
`;

const EmptyText = styled.p`
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.celeste};
  margin: 0;
`;
