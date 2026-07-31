/**
 * PnlArAging
 *
 * Accounts Receivable Aging section.
 * - Bar chart: Current, 30-60, 60-90, 90+ buckets with color gradient
 * - Table: Top 10 customers by outstanding balance
 */

import styled, { keyframes, useTheme } from 'styled-components';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from 'recharts';
import { glassPanel, type Theme } from '@a64core/shared';
import type { ArAgingResponse } from '../../types/finance';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatAed(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return `${value.toLocaleString()}`;
}

// Aging severity ramp (same convention as the APAgingPage bucket cards in
// the sibling shard): healthy emerald -> warning gold -> escalating terra ->
// severe coral (`quarantined`, the only red). Uses the generic `warning`
// semantic token for the early-overdue step, NOT `phase.harvesting` — same
// hex, different meaning; harvesting stays reserved for the literal harvest
// phase per spec §5.2. Four distinct steps, not a categorical series, so
// this intentionally sits outside the celeste/gold/emerald/lapis/terra/
// lavender chart-series order.
const bucketColors = (theme: Theme) => [
  theme.colors.phase.fruiting,    // Current — healthy
  theme.colors.warning,           // 30-60d — early overdue
  theme.colors.bright.terra,      // 60-90d — escalating
  theme.colors.phase.quarantined, // 90+d — severe
];

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

const ChartContainer = styled.div`
  height: 220px;
  margin-bottom: ${({ theme }) => theme.spacing.xl};
`;

const SkeletonBar = styled.div`
  height: 220px;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  background: linear-gradient(
    90deg,
    ${({ theme }) => theme.colors.glass.base} 25%,
    ${({ theme }) => theme.colors.glass.hi} 50%,
    ${({ theme }) => theme.colors.glass.base} 75%
  );
  background-size: 800px 100%;
  animation: ${shimmer} 1.5s infinite linear;
  margin-bottom: ${({ theme }) => theme.spacing.xl};
`;

const TableWrapper = styled.div`
  overflow-x: auto;
`;

// Dense table, spec §4: transparent rows/header, Space Mono uppercase
// celeste column headers, `line` row dividers, hover rgba(180,200,220,.05).
// Already sits inside the Section glass panel — no per-row glass.
const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  min-width: 500px;
`;

const Th = styled.th`
  text-align: left;
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};
  background: transparent;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: ${({ theme }) => theme.colors.celeste};
  border-bottom: 2px solid ${({ theme }) => theme.colors.line};
  white-space: nowrap;

  &[data-right] {
    text-align: right;
  }
`;

interface TdProps {
  $right?: boolean;
  $danger?: boolean;
}

const Td = styled.td<TdProps>`
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  text-align: ${({ $right }) => ($right ? 'right' : 'left')};
  color: ${({ theme, $danger }) => ($danger ? theme.colors.error : theme.colors.textPrimary)};
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
`;

const TotalsRow = styled.tr`
  background: rgba(180, 200, 220, 0.05);
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
`;

const EmptyState = styled.div`
  padding: ${({ theme }) => theme.spacing.xl};
  text-align: center;
  color: ${({ theme }) => theme.colors.muted};
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

// ─── Component ────────────────────────────────────────────────────────────────

interface PnlArAgingProps {
  data?: ArAgingResponse;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

export function PnlArAging({ data, isLoading, isError, onRetry }: PnlArAgingProps) {
  const theme = useTheme();
  return (
    <Section aria-labelledby="ar-aging-title">
      <SectionTitle id="ar-aging-title">Accounts Receivable Aging</SectionTitle>

      {isLoading && <SkeletonBar aria-label="Loading AR aging chart" aria-busy="true" />}

      {isError && (
        <ErrorState role="alert">
          <span>Failed to load AR aging data.</span>
          <RetryButton onClick={onRetry}>Retry</RetryButton>
        </ErrorState>
      )}

      {!isLoading && !isError && !data && (
        <EmptyState>No AR aging data available.</EmptyState>
      )}

      {!isLoading && !isError && data && (
        <>
          {/* Bar chart */}
          <ChartContainer>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.buckets}
                margin={{ top: 8, right: 16, left: 0, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme.colors.line} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 12, fontFamily: theme.typography.fontFamily.mono, fill: theme.colors.muted }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tickFormatter={formatAed}
                  tick={{ fontSize: 11, fontFamily: theme.typography.fontFamily.mono, fill: theme.colors.muted }}
                  tickLine={false}
                  axisLine={false}
                  width={60}
                />
                <Tooltip
                  formatter={(value: number) => [`${value.toLocaleString()} AED`, 'Outstanding']}
                  labelStyle={{ fontWeight: 600, fontSize: '13px', color: theme.colors.textPrimary }}
                  contentStyle={{
                    borderRadius: '8px',
                    border: `1px solid ${theme.colors.glass.border}`,
                    fontSize: '13px',
                    background: theme.colors.cosmosHi,
                  }}
                />
                <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                  {data.buckets.map((_, index) => {
                    const palette = bucketColors(theme);
                    return (
                      <Cell
                        key={`bucket-${index}`}
                        fill={palette[Math.min(index, palette.length - 1)]}
                      />
                    );
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>

          {/* Top customers table */}
          {data.topCustomers && data.topCustomers.length > 0 && (
            <TableWrapper>
              <Table aria-label="Top customers by outstanding AR balance">
                <thead>
                  <tr>
                    <Th scope="col">Customer</Th>
                    <Th scope="col" data-right>Total Outstanding</Th>
                    <Th scope="col" data-right>Current</Th>
                    <Th scope="col" data-right>30–60 d</Th>
                    <Th scope="col" data-right>60–90 d</Th>
                    <Th scope="col" data-right>90+ d</Th>
                    <Th scope="col" data-right>Oldest (days)</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.topCustomers.slice(0, 10).map((c) => (
                    <tr key={c.customerId}>
                      <Td>{c.customerName}</Td>
                      <Td $right>{formatAed(c.totalOutstanding)}</Td>
                      <Td $right>{formatAed(c.current)}</Td>
                      <Td $right>{formatAed(c.days30to60)}</Td>
                      <Td $right $danger={c.days60to90 > 0}>{formatAed(c.days60to90)}</Td>
                      <Td $right $danger={c.days90plus > 0}>{formatAed(c.days90plus)}</Td>
                      <Td $right $danger={c.oldestInvoiceDays > 60}>
                        {c.oldestInvoiceDays}
                      </Td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <TotalsRow>
                    <Td as="td">Total</Td>
                    <Td $right as="td">{formatAed(data.totalOutstanding)}</Td>
                    <Td as="td" colSpan={5} />
                  </TotalsRow>
                </tfoot>
              </Table>
            </TableWrapper>
          )}
        </>
      )}
    </Section>
  );
}
