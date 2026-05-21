/**
 * PnlKpiCards
 *
 * 4–6 KPI summary cards displayed in a responsive grid at the top of the P&L page.
 * Shows: Total Revenue, Gross Profit, Operating Profit, Total Orders, Kg Sold, AR Outstanding.
 */

import styled, { keyframes } from 'styled-components';
import type { PnlSummary } from '../../types/finance';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatAed(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M AED`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K AED`;
  }
  return `${value.toLocaleString()} AED`;
}

function formatNumber(value: number): string {
  return value.toLocaleString();
}

function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

// ─── Styled Components ────────────────────────────────────────────────────────

const shimmer = keyframes`
  0% { background-position: -400px 0; }
  100% { background-position: 400px 0; }
`;

const SkeletonBlock = styled.div`
  height: 24px;
  border-radius: ${({ theme }) => theme.radii.sm};
  background: linear-gradient(
    90deg,
    ${({ theme }) => theme.colors.surface.sunken} 25%,
    ${({ theme }) => theme.colors.surface.raised} 50%,
    ${({ theme }) => theme.colors.surface.sunken} 75%
  );
  background-size: 800px 100%;
  animation: ${shimmer} 1.5s infinite linear;
  margin-bottom: ${({ theme }) => theme.space['2']};
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: ${({ theme }) => theme.space['6']};
  margin-bottom: ${({ theme }) => theme.space['8']};

  @media (max-width: ${({ theme }) => theme.breakpoints.tablet}) {
    grid-template-columns: repeat(2, 1fr);
  }

  @media (max-width: ${({ theme }) => theme.breakpoints.mobile}) {
    grid-template-columns: 1fr;
  }
`;

const Card = styled.article`
  background: ${({ theme }) => theme.colors.surface.canvas};
  border: 1px solid ${({ theme }) => theme.colors.surface.sunken};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: ${({ theme }) => theme.space['6']};
  box-shadow: ${({ theme }) => theme.shadows.sm};
  transition: box-shadow 150ms ease-in-out;

  &:hover {
    box-shadow: ${({ theme }) => theme.shadows.md};
  }
`;

const CardHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${({ theme }) => theme.space['4']};
`;

const CardTitle = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.text.secondary};
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const CardIcon = styled.span`
  font-size: 20px;
  line-height: 1;
`;

interface ValueProps {
  $color?: 'positive' | 'negative' | 'neutral' | 'warning';
}

const VALUE_COLORS = {
  positive: '#0F6E56',
  negative: '#9E2A2A',
  neutral: '#0F0F0F',
  warning: '#B8842A',
};

const CardValue = styled.div<ValueProps>`
  font-size: ${({ theme }) => theme.fontSizes.h2};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ $color = 'neutral', theme }) =>
    $color === 'neutral' ? theme.colors.text.primary : VALUE_COLORS[$color]};
  line-height: ${({ theme }) => theme.lineHeights.snug};
  margin-bottom: ${({ theme }) => theme.space['1']};
  word-break: break-word;

  @media (max-width: 1200px) {
    font-size: ${({ theme }) => theme.fontSizes.h4};
  }
`;

const CardSub = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
  color: ${({ theme }) => theme.colors.text.secondary};
  margin-top: ${({ theme }) => theme.space['1']};
`;

// ─── Component ────────────────────────────────────────────────────────────────

interface PnlKpiCardsProps {
  summary?: PnlSummary;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

function SkeletonCard() {
  return (
    <Card aria-busy="true" aria-label="Loading KPI data">
      <CardHeader>
        <SkeletonBlock style={{ width: '80px' }} />
      </CardHeader>
      <SkeletonBlock style={{ width: '120px', height: '32px' }} />
      <SkeletonBlock style={{ width: '60px' }} />
    </Card>
  );
}

export function PnlKpiCards({ summary, isLoading, isError, onRetry }: PnlKpiCardsProps) {
  if (isLoading) {
    return (
      <Grid>
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </Grid>
    );
  }

  if (isError || !summary) {
    return (
      <Grid>
        <Card
          style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '32px' }}
          role="alert"
        >
          <p style={{ marginBottom: '16px', color: '#9E2A2A' }}>
            Failed to load KPI summary.
          </p>
          <button
            onClick={onRetry}
            style={{
              padding: '8px 16px',
              background: '#0F6E56',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Retry
          </button>
        </Card>
      </Grid>
    );
  }

  const {
    revenue,
    grossProfit,
    grossMarginPct,
    operatingProfit,
    operatingMarginPct,
    orderCounts,
    totalKgSold,
    totalOutstandingAr,
    period,
  } = summary;

  return (
    <Grid role="list" aria-label="Key performance indicators">
      {/* Total Revenue */}
      <Card role="listitem">
        <CardHeader>
          <CardTitle>Total Revenue</CardTitle>
          <CardIcon aria-hidden="true">💰</CardIcon>
        </CardHeader>
        <CardValue $color="positive">{formatAed(revenue)}</CardValue>
        <CardSub>{period.label}</CardSub>
      </Card>

      {/* Gross Profit */}
      <Card role="listitem">
        <CardHeader>
          <CardTitle>Gross Profit</CardTitle>
          <CardIcon aria-hidden="true">📈</CardIcon>
        </CardHeader>
        <CardValue $color={grossProfit >= 0 ? 'positive' : 'negative'}>
          {formatAed(grossProfit)}
        </CardValue>
        <CardSub>Margin: {formatPct(grossMarginPct)}</CardSub>
      </Card>

      {/* Operating Profit */}
      <Card role="listitem">
        <CardHeader>
          <CardTitle>Operating Profit</CardTitle>
          <CardIcon aria-hidden="true">📊</CardIcon>
        </CardHeader>
        <CardValue $color={operatingProfit >= 0 ? 'positive' : 'negative'}>
          {formatAed(operatingProfit)}
        </CardValue>
        <CardSub>Margin: {formatPct(operatingMarginPct)}</CardSub>
      </Card>

      {/* Total Orders */}
      <Card role="listitem">
        <CardHeader>
          <CardTitle>Total Orders</CardTitle>
          <CardIcon aria-hidden="true">📦</CardIcon>
        </CardHeader>
        <CardValue $color="neutral">{formatNumber(orderCounts.total)}</CardValue>
        <CardSub>
          {formatNumber(orderCounts.paid)} paid · {formatNumber(orderCounts.pending)} pending
          {orderCounts.overdue > 0 && (
            <span style={{ color: '#9E2A2A' }}> · {formatNumber(orderCounts.overdue)} overdue</span>
          )}
        </CardSub>
      </Card>

      {/* Kg Sold */}
      <Card role="listitem">
        <CardHeader>
          <CardTitle>Total Kg Sold</CardTitle>
          <CardIcon aria-hidden="true">⚖️</CardIcon>
        </CardHeader>
        <CardValue $color="neutral">{formatNumber(Math.round(totalKgSold))} kg</CardValue>
        <CardSub>
          {revenue > 0 && totalKgSold > 0
            ? `Avg ${(revenue / totalKgSold).toFixed(2)} AED/kg`
            : 'No sales data'}
        </CardSub>
      </Card>

      {/* Outstanding AR */}
      <Card role="listitem">
        <CardHeader>
          <CardTitle>Outstanding AR</CardTitle>
          <CardIcon aria-hidden="true">🏦</CardIcon>
        </CardHeader>
        <CardValue $color={totalOutstandingAr > 0 ? 'warning' : 'positive'}>
          {formatAed(totalOutstandingAr)}
        </CardValue>
        <CardSub>Accounts receivable</CardSub>
      </Card>
    </Grid>
  );
}
