/**
 * PnlRevenueConfidence
 *
 * Secondary section showing revenue split by price-source confidence level.
 * - Pie chart with legend
 * - Warning banner when >30% of revenue is imputed
 */

import styled, { keyframes, useTheme } from 'styled-components';
import { AlertTriangle } from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
} from 'recharts';
import { glassPanel, type Theme } from '@a64core/shared';
import type { RevenueSourcesResponse } from '../../types/finance';

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Confidence level maps cleanly onto semantic state: confirmed = success,
// alias-matched = informational, imputed/estimated = warning, none = neutral.
const sourceColors = (theme: Theme): Record<string, string> => ({
  excel_match: theme.colors.success,
  excel_alias_match: theme.colors.info,
  imputed: theme.colors.warning,
  no_data: theme.colors.muted,
});

const SOURCE_LABELS: Record<string, string> = {
  excel_match: 'Excel Confirmed',
  excel_alias_match: 'Alias Matched',
  imputed: 'Imputed (avg)',
  no_data: 'No Price Data',
};

const SOURCE_DESCRIPTIONS: Record<string, string> = {
  excel_match: 'Price matched exactly from uploaded price list.',
  excel_alias_match: 'Price matched via known product alias.',
  imputed: 'Price estimated from historical averages. Less reliable.',
  no_data: 'No price source found — revenue recorded as zero.',
};

function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

// ─── Styled Components ────────────────────────────────────────────────────────

const shimmer = keyframes`
  0% { background-position: -400px 0; }
  100% { background-position: 400px 0; }
`;

const Section = styled.section`
  ${glassPanel}
  padding: ${({ theme }) => theme.spacing.lg};
  margin-bottom: ${({ theme }) => theme.spacing.xl};
`;

const SectionTitle = styled.h2`
  font-size: ${({ theme }) => theme.typography.fontSize.lg};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 ${({ theme }) => theme.spacing.lg} 0;
`;

const Layout = styled.div`
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: ${({ theme }) => theme.spacing.xl};
  align-items: start;

  @media (max-width: ${({ theme }) => theme.breakpoints.tablet}) {
    grid-template-columns: 1fr;
  }
`;

const ChartContainer = styled.div`
  height: 240px;
`;

const SkeletonCircle = styled.div`
  width: 240px;
  height: 240px;
  border-radius: 50%;
  background: linear-gradient(
    90deg,
    ${({ theme }) => theme.colors.glass.base} 25%,
    ${({ theme }) => theme.colors.glass.hi} 50%,
    ${({ theme }) => theme.colors.glass.base} 75%
  );
  background-size: 800px 100%;
  animation: ${shimmer} 1.5s infinite linear;
  margin: 0 auto;
`;

const LegendList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
  justify-content: center;
`;

const LegendItem = styled.li`
  display: flex;
  align-items: flex-start;
  gap: ${({ theme }) => theme.spacing.sm};
`;

interface DotProps {
  $color: string;
}

const Dot = styled.span<DotProps>`
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: ${({ $color }) => $color};
  flex-shrink: 0;
  margin-top: 3px;
`;

const LegendText = styled.div`
  display: flex;
  flex-direction: column;
`;

const LegendLabel = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const LegendDesc = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  color: ${({ theme }) => theme.colors.muted};
  margin-top: 2px;
`;

const LegendPct = styled.span`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.celeste};
  margin-left: auto;
  padding-left: ${({ theme }) => theme.spacing.sm};
`;

// Text must be the warning colour itself (gold-b), not `gold[800]` — that
// ramp step is a dark-cream-ground shade, nearly invisible on Cosmos Ink.
// Same fix as FinanceUnreachableBanner.tsx.
const WarningBanner = styled.div`
  display: flex;
  align-items: flex-start;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.warningBg};
  border: 1px solid ${({ theme }) => theme.colors.warning};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  margin-top: ${({ theme }) => theme.spacing.lg};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.warning};
`;

const WarningIcon = styled.span`
  display: inline-flex;
  flex-shrink: 0;
`;

const ErrorState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.xl};
  color: ${({ theme }) => theme.colors.error};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  text-align: center;
`;

// `primary[500]` is a lapis-b fill — needs `onDark` (cream), not `onAccent`.
const RetryButton = styled.button`
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};
  background: ${({ theme }) => theme.colors.primary[500]};
  color: ${({ theme }) => theme.colors.onDark};
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  cursor: pointer;
  font-family: inherit;
`;

const EmptyState = styled.div`
  padding: ${({ theme }) => theme.spacing.xl};
  text-align: center;
  color: ${({ theme }) => theme.colors.muted};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
`;

// ─── Component ────────────────────────────────────────────────────────────────

interface PnlRevenueConfidenceProps {
  data?: RevenueSourcesResponse;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

export function PnlRevenueConfidence({
  data,
  isLoading,
  isError,
  onRetry,
}: PnlRevenueConfidenceProps) {
  const theme = useTheme();
  return (
    <Section aria-labelledby="confidence-title">
      <SectionTitle id="confidence-title">Revenue Confidence</SectionTitle>

      {isLoading && (
        <Layout>
          <SkeletonCircle aria-label="Loading revenue confidence chart" aria-busy="true" />
        </Layout>
      )}

      {isError && (
        <ErrorState role="alert">
          <span>Failed to load revenue confidence data.</span>
          <RetryButton onClick={onRetry}>Retry</RetryButton>
        </ErrorState>
      )}

      {!isLoading && !isError && !data && (
        <EmptyState>No revenue confidence data available.</EmptyState>
      )}

      {!isLoading && !isError && data && (
        <>
          <Layout>
            <ChartContainer>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.sources}
                    dataKey="amount"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    innerRadius={55}
                    paddingAngle={2}
                  >
                    {data.sources.map((entry) => (
                      <Cell
                        key={entry.priceSource}
                        fill={sourceColors(theme)[entry.priceSource] || theme.colors.textDisabled}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      `${value.toLocaleString()} AED`,
                      name,
                    ]}
                    contentStyle={{
                      borderRadius: '8px',
                      border: `1px solid ${theme.colors.glass.border}`,
                      fontSize: '13px',
                      background: theme.colors.cosmosHi,
                      color: theme.colors.textPrimary,
                    }}
                  />
                  {/* Suppress default Recharts legend — we build our own */}
                  <Legend content={() => null} />
                </PieChart>
              </ResponsiveContainer>
            </ChartContainer>

            <LegendList aria-label="Revenue confidence breakdown">
              {data.sources.map((entry) => (
                <LegendItem key={entry.priceSource}>
                  <Dot $color={sourceColors(theme)[entry.priceSource] || theme.colors.textDisabled} aria-hidden="true" />
                  <LegendText>
                    <LegendLabel>
                      {SOURCE_LABELS[entry.priceSource] || entry.label}
                    </LegendLabel>
                    <LegendDesc>
                      {SOURCE_DESCRIPTIONS[entry.priceSource] || ''}
                    </LegendDesc>
                  </LegendText>
                  <LegendPct aria-label={`${formatPct(entry.pct)} of total revenue`}>
                    {formatPct(entry.pct)}
                  </LegendPct>
                </LegendItem>
              ))}
            </LegendList>
          </Layout>

          {/* Warning banner when >30% of revenue is imputed */}
          {data.imputedPct > 30 && (
            <WarningBanner role="alert" aria-live="polite">
              <WarningIcon aria-hidden="true"><AlertTriangle size={18} strokeWidth={1.6} /></WarningIcon>
              <div>
                <strong>{formatPct(data.imputedPct)} of revenue is imputed from averages.</strong>{' '}
                Toggle &quot;Include imputed&quot; off in the filters above to see confirmed-only
                revenue figures.
              </div>
            </WarningBanner>
          )}
        </>
      )}
    </Section>
  );
}
