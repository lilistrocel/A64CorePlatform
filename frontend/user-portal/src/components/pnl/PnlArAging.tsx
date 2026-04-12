/**
 * PnlArAging
 *
 * Accounts Receivable Aging section.
 * - Bar chart: Current, 30-60, 60-90, 90+ buckets with color gradient
 * - Table: Top 10 customers by outstanding balance
 */

import styled, { keyframes } from 'styled-components';
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
import type { ArAgingResponse } from '../../types/finance';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatAed(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return `${value.toLocaleString()}`;
}

// Green → Yellow → Orange → Red gradient for aging buckets
const BUCKET_COLORS = ['#10B981', '#F59E0B', '#F97316', '#EF4444'];

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
  height: 220px;
  margin-bottom: ${({ theme }) => theme.spacing.xl};
`;

const SkeletonBar = styled.div`
  height: 220px;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  background: linear-gradient(
    90deg,
    ${({ theme }) => theme.colors.neutral[200]} 25%,
    ${({ theme }) => theme.colors.neutral[100]} 50%,
    ${({ theme }) => theme.colors.neutral[200]} 75%
  );
  background-size: 800px 100%;
  animation: ${shimmer} 1.5s infinite linear;
  margin-bottom: ${({ theme }) => theme.spacing.xl};
`;

const TableWrapper = styled.div`
  overflow-x: auto;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  min-width: 500px;
`;

const Th = styled.th`
  text-align: left;
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};
  background: ${({ theme }) => theme.colors.neutral[50]};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: ${({ theme }) => theme.colors.textSecondary};
  border-bottom: 2px solid ${({ theme }) => theme.colors.neutral[200]};
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
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  text-align: ${({ $right }) => ($right ? 'right' : 'left')};
  color: ${({ theme, $danger }) => ($danger ? theme.colors.error : theme.colors.textPrimary)};
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
`;

const TotalsRow = styled.tr`
  background: ${({ theme }) => theme.colors.neutral[50]};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
`;

const EmptyState = styled.div`
  padding: ${({ theme }) => theme.spacing.xl};
  text-align: center;
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
  text-align: center;
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
`;

// ─── Component ────────────────────────────────────────────────────────────────

interface PnlArAgingProps {
  data?: ArAgingResponse;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

export function PnlArAging({ data, isLoading, isError, onRetry }: PnlArAgingProps) {
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
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e0e0e0" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 12, fill: '#616161' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tickFormatter={formatAed}
                  tick={{ fontSize: 11, fill: '#616161' }}
                  tickLine={false}
                  axisLine={false}
                  width={60}
                />
                <Tooltip
                  formatter={(value: number) => [`${value.toLocaleString()} AED`, 'Outstanding']}
                  labelStyle={{ fontWeight: 600, fontSize: '13px' }}
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid #e0e0e0',
                    fontSize: '13px',
                  }}
                />
                <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                  {data.buckets.map((_, index) => (
                    <Cell
                      key={`bucket-${index}`}
                      fill={BUCKET_COLORS[Math.min(index, BUCKET_COLORS.length - 1)]}
                    />
                  ))}
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
