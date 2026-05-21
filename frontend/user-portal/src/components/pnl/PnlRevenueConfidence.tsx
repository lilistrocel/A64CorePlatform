/**
 * PnlRevenueConfidence
 *
 * Secondary section showing revenue split by price-source confidence level.
 * - Pie chart with legend
 * - Warning banner when >30% of revenue is imputed
 */

import styled, { keyframes } from 'styled-components';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
} from 'recharts';
import type { RevenueSourcesResponse } from '../../types/finance';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SOURCE_COLORS: Record<string, string> = {
  excel_match: '#0F6E56',
  excel_alias_match: '#0F6E56',
  imputed: '#B8842A',
  no_data: '#4B4844',
};

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
  background: ${({ theme }) => theme.colors.surface.canvas};
  border: 1px solid ${({ theme }) => theme.colors.surface.sunken};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: ${({ theme }) => theme.space['6']};
  box-shadow: ${({ theme }) => theme.shadows.sm};
  margin-bottom: ${({ theme }) => theme.space['8']};
`;

const SectionTitle = styled.h2`
  font-size: ${({ theme }) => theme.fontSizes.bodyLg};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text.primary};
  margin: 0 0 ${({ theme }) => theme.space['6']} 0;
`;

const Layout = styled.div`
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: ${({ theme }) => theme.space['8']};
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
    ${({ theme }) => theme.colors.surface.sunken} 25%,
    ${({ theme }) => theme.colors.surface.raised} 50%,
    ${({ theme }) => theme.colors.surface.sunken} 75%
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
  gap: ${({ theme }) => theme.space['4']};
  justify-content: center;
`;

const LegendItem = styled.li`
  display: flex;
  align-items: flex-start;
  gap: ${({ theme }) => theme.space['2']};
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
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.text.primary};
`;

const LegendDesc = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.caption};
  color: ${({ theme }) => theme.colors.text.secondary};
  margin-top: 2px;
`;

const LegendPct = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text.secondary};
  margin-left: auto;
  padding-left: ${({ theme }) => theme.space['2']};
`;

const WarningBanner = styled.div`
  display: flex;
  align-items: flex-start;
  gap: ${({ theme }) => theme.space['2']};
  padding: ${({ theme }) => theme.space['4']};
  background: rgba(184,132,42,0.10);
  border: 1px solid #B8842A;
  border-radius: ${({ theme }) => theme.radii.md};
  margin-top: ${({ theme }) => theme.space['6']};
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
  color: #B8842A;
`;

const WarningIcon = styled.span`
  font-size: 18px;
  flex-shrink: 0;
`;

const ErrorState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.space['4']};
  padding: ${({ theme }) => theme.space['8']};
  color: ${({ theme }) => theme.colors.status.danger};
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
  text-align: center;
`;

const RetryButton = styled.button`
  padding: ${({ theme }) => `${theme.space['2']} ${theme.space['4']}`};
  background: ${({ theme }) => theme.colors.accent.sage};
  color: white;
  border: none;
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
  cursor: pointer;
  font-family: inherit;
`;

const EmptyState = styled.div`
  padding: ${({ theme }) => theme.space['8']};
  text-align: center;
  color: ${({ theme }) => theme.colors.text.secondary};
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
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
                        fill={SOURCE_COLORS[entry.priceSource] || '#4B4844'}
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
                      border: '1px solid #DCD8CF',
                      fontSize: '13px',
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
                  <Dot $color={SOURCE_COLORS[entry.priceSource] || '#4B4844'} aria-hidden="true" />
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
              <WarningIcon aria-hidden="true">⚠️</WarningIcon>
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
