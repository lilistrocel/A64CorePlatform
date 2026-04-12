/**
 * PnlStatementTable
 *
 * Classic collapsible P&L statement laid out as a financial table.
 * Sections: Revenue, COGS, Gross Profit, OpEx, Operating Profit.
 * Bold totals, right-aligned amounts, parentheses for negative/cost values.
 */

import { useState } from 'react';
import styled, { keyframes } from 'styled-components';
import type { PnlSummary } from '../../types/finance';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function aed(value: number, cost = false): string {
  const abs = Math.abs(value);
  let formatted: string;
  if (abs >= 1_000_000) {
    formatted = `${(abs / 1_000_000).toFixed(3)}M`;
  } else {
    formatted = abs.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }
  return cost || value < 0 ? `(${formatted})` : formatted;
}

function pct(value: number): string {
  return `${value.toFixed(1)}%`;
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
  overflow-x: auto;
`;

const SectionTitle = styled.h2`
  font-size: ${({ theme }) => theme.typography.fontSize.lg};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 ${({ theme }) => theme.spacing.lg} 0;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  min-width: 480px;
`;

const TBodySection = styled.tbody``;

interface RowProps {
  $bold?: boolean;
  $indent?: boolean;
  $separator?: boolean;
  $positive?: boolean;
  $negative?: boolean;
  $subtle?: boolean;
}

const Tr = styled.tr<RowProps>`
  ${({ $separator, theme }) =>
    $separator &&
    `
    border-top: 2px solid ${theme.colors.neutral[300]};
  `}

  ${({ $bold, theme }) =>
    $bold &&
    `
    background: ${theme.colors.neutral[50]};
    font-weight: ${theme.typography.fontWeight.semibold};
  `}

  &:hover {
    background: ${({ theme, $bold }) => ($bold ? theme.colors.neutral[50] : theme.colors.neutral[50])};
  }
`;

interface TdProps {
  $right?: boolean;
  $bold?: boolean;
  $indent?: boolean;
  $positive?: boolean;
  $negative?: boolean;
  $muted?: boolean;
}

const Td = styled.td<TdProps>`
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};
  color: ${({ theme, $positive, $negative, $muted }) => {
    if ($positive) return theme.colors.success;
    if ($negative) return theme.colors.error;
    if ($muted) return theme.colors.textSecondary;
    return theme.colors.textPrimary;
  }};
  text-align: ${({ $right }) => ($right ? 'right' : 'left')};
  font-weight: ${({ theme, $bold }) =>
    $bold ? theme.typography.fontWeight.semibold : theme.typography.fontWeight.regular};
  padding-left: ${({ $indent, theme }) =>
    $indent ? `calc(${theme.spacing.xl} + ${theme.spacing.md})` : theme.spacing.md};
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
`;

const CollapseButton = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  color: ${({ theme }) => theme.colors.textSecondary};
  padding: 0 ${({ theme }) => theme.spacing.xs};
  margin-right: ${({ theme }) => theme.spacing.xs};
  vertical-align: middle;
  line-height: 1;

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary[500]};
    outline-offset: 2px;
  }
`;

const Divider = styled.tr`
  td {
    border-top: 1px solid ${({ theme }) => theme.colors.neutral[300]};
    padding: 0;
    height: 1px;
  }
`;

const SectionHeaderRow = styled.tr`
  background: ${({ theme }) => theme.colors.neutral[50]};
  cursor: pointer;
`;

const SkeletonBlock = styled.div`
  height: 20px;
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  background: linear-gradient(
    90deg,
    ${({ theme }) => theme.colors.neutral[200]} 25%,
    ${({ theme }) => theme.colors.neutral[100]} 50%,
    ${({ theme }) => theme.colors.neutral[200]} 75%
  );
  background-size: 800px 100%;
  animation: ${shimmer} 1.5s infinite linear;
  margin: 8px 0;
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

interface PnlStatementTableProps {
  summary?: PnlSummary;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

export function PnlStatementTable({
  summary,
  isLoading,
  isError,
  onRetry,
}: PnlStatementTableProps) {
  const [revenueOpen, setRevenueOpen] = useState(true);
  const [cogsOpen, setCogsOpen] = useState(true);
  const [opexOpen, setOpexOpen] = useState(true);

  return (
    <Section aria-labelledby="pnl-table-title">
      <SectionTitle id="pnl-table-title">P&amp;L Statement</SectionTitle>

      {isLoading && (
        <div aria-label="Loading P&L statement" aria-busy="true">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonBlock key={i} style={{ width: i % 3 === 0 ? '100%' : '60%' }} />
          ))}
        </div>
      )}

      {isError && (
        <ErrorState role="alert">
          <span>Failed to load P&L statement.</span>
          <RetryButton onClick={onRetry}>Retry</RetryButton>
        </ErrorState>
      )}

      {!isLoading && !isError && summary && (
        <Table role="table" aria-label="Profit and loss statement">
          <colgroup>
            <col style={{ width: '55%' }} />
            <col style={{ width: '22%' }} />
            <col style={{ width: '23%' }} />
          </colgroup>
          <thead>
            <tr>
              <Td as="th" $bold style={{ fontWeight: 600, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#9e9e9e', paddingBottom: '8px' }}>
                Line Item
              </Td>
              <Td as="th" $right $bold style={{ fontWeight: 600, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#9e9e9e', paddingBottom: '8px' }}>
                Amount (AED)
              </Td>
              <Td as="th" $right $bold style={{ fontWeight: 600, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#9e9e9e', paddingBottom: '8px' }}>
                % of Revenue
              </Td>
            </tr>
          </thead>

          {/* ── REVENUE ─────────────────────────────────────────────── */}
          <TBodySection>
            <SectionHeaderRow
              onClick={() => setRevenueOpen((v) => !v)}
              aria-expanded={revenueOpen}
            >
              <Td $bold>
                <CollapseButton
                  aria-label={revenueOpen ? 'Collapse revenue section' : 'Expand revenue section'}
                  tabIndex={-1}
                >
                  {revenueOpen ? '▼' : '▶'}
                </CollapseButton>
                Revenue
              </Td>
              <Td $right $bold $positive>
                {aed(summary.revenue)}
              </Td>
              <Td $right $muted>100.0%</Td>
            </SectionHeaderRow>

            {revenueOpen && (
              <>
                <Tr>
                  <Td $indent $muted>Excel confirmed</Td>
                  <Td $right $muted>{aed(summary.revenueBreakdown.excelConfirmed)}</Td>
                  <Td $right $muted>
                    {summary.revenue > 0
                      ? pct((summary.revenueBreakdown.excelConfirmed / summary.revenue) * 100)
                      : '—'}
                  </Td>
                </Tr>
                <Tr>
                  <Td $indent $muted>Alias matched</Td>
                  <Td $right $muted>{aed(summary.revenueBreakdown.aliasMatched)}</Td>
                  <Td $right $muted>
                    {summary.revenue > 0
                      ? pct((summary.revenueBreakdown.aliasMatched / summary.revenue) * 100)
                      : '—'}
                  </Td>
                </Tr>
                <Tr>
                  <Td $indent $muted>Imputed</Td>
                  <Td $right $muted>{aed(summary.revenueBreakdown.imputed)}</Td>
                  <Td $right $muted>
                    {summary.revenue > 0
                      ? pct((summary.revenueBreakdown.imputed / summary.revenue) * 100)
                      : '—'}
                  </Td>
                </Tr>
              </>
            )}
          </TBodySection>

          <Divider><td colSpan={3} /></Divider>

          {/* ── COGS ─────────────────────────────────────────────────── */}
          <TBodySection>
            <SectionHeaderRow
              onClick={() => setCogsOpen((v) => !v)}
              aria-expanded={cogsOpen}
            >
              <Td $bold>
                <CollapseButton
                  aria-label={cogsOpen ? 'Collapse COGS section' : 'Expand COGS section'}
                  tabIndex={-1}
                >
                  {cogsOpen ? '▼' : '▶'}
                </CollapseButton>
                COGS
              </Td>
              <Td $right $bold $negative>
                {aed(summary.cogs, true)}
              </Td>
              <Td $right $muted>
                {summary.revenue > 0 ? pct((summary.cogs / summary.revenue) * 100) : '—'}
              </Td>
            </SectionHeaderRow>

            {cogsOpen && (
              <>
                <Tr>
                  <Td $indent $muted>Fertilizer</Td>
                  <Td $right $muted>{aed(summary.cogsBreakdown.fertilizer, true)}</Td>
                  <Td $right $muted>
                    {summary.revenue > 0
                      ? pct((summary.cogsBreakdown.fertilizer / summary.revenue) * 100)
                      : '—'}
                  </Td>
                </Tr>
                <Tr>
                  <Td $indent $muted>Seeds</Td>
                  <Td $right $muted>{aed(summary.cogsBreakdown.seeds, true)}</Td>
                  <Td $right $muted>
                    {summary.revenue > 0
                      ? pct((summary.cogsBreakdown.seeds / summary.revenue) * 100)
                      : '—'}
                  </Td>
                </Tr>
                <Tr>
                  <Td $indent $muted>Other inputs</Td>
                  <Td $right $muted>{aed(summary.cogsBreakdown.otherInputs, true)}</Td>
                  <Td $right $muted>
                    {summary.revenue > 0
                      ? pct((summary.cogsBreakdown.otherInputs / summary.revenue) * 100)
                      : '—'}
                  </Td>
                </Tr>
              </>
            )}
          </TBodySection>

          {/* ── GROSS PROFIT ─────────────────────────────────────────── */}
          <TBodySection>
            <Tr $bold $separator>
              <Td $bold>Gross Profit</Td>
              <Td $right $bold $positive={summary.grossProfit >= 0} $negative={summary.grossProfit < 0}>
                {aed(summary.grossProfit)}
              </Td>
              <Td $right $bold>
                {pct(summary.grossMarginPct)}
              </Td>
            </Tr>
          </TBodySection>

          <Divider><td colSpan={3} /></Divider>

          {/* ── OPEX ─────────────────────────────────────────────────── */}
          <TBodySection>
            <SectionHeaderRow
              onClick={() => setOpexOpen((v) => !v)}
              aria-expanded={opexOpen}
            >
              <Td $bold>
                <CollapseButton
                  aria-label={opexOpen ? 'Collapse OpEx section' : 'Expand OpEx section'}
                  tabIndex={-1}
                >
                  {opexOpen ? '▼' : '▶'}
                </CollapseButton>
                Operating Expenses
              </Td>
              <Td $right $bold $negative>
                {aed(summary.opex, true)}
              </Td>
              <Td $right $muted>
                {summary.revenue > 0 ? pct((summary.opex / summary.revenue) * 100) : '—'}
              </Td>
            </SectionHeaderRow>

            {opexOpen && (
              <>
                <Tr>
                  <Td $indent $muted>Maintenance &amp; repairs</Td>
                  <Td $right $muted>{aed(summary.opexBreakdown.maintenanceAndRepairs, true)}</Td>
                  <Td $right $muted>—</Td>
                </Tr>
                <Tr>
                  <Td $indent $muted>Asset purchases</Td>
                  <Td $right $muted>{aed(summary.opexBreakdown.assetPurchases, true)}</Td>
                  <Td $right $muted>—</Td>
                </Tr>
                <Tr>
                  <Td $indent $muted>Labor</Td>
                  <Td $right $muted>{aed(summary.opexBreakdown.labor, true)}</Td>
                  <Td $right $muted>—</Td>
                </Tr>
                <Tr>
                  <Td $indent $muted>Logistics</Td>
                  <Td $right $muted>{aed(summary.opexBreakdown.logistics, true)}</Td>
                  <Td $right $muted>—</Td>
                </Tr>
              </>
            )}
          </TBodySection>

          {/* ── OPERATING PROFIT ─────────────────────────────────────── */}
          <TBodySection>
            <Tr $bold $separator>
              <Td $bold>Operating Profit</Td>
              <Td $right $bold $positive={summary.operatingProfit >= 0} $negative={summary.operatingProfit < 0}>
                {aed(summary.operatingProfit)}
              </Td>
              <Td $right $bold>
                {pct(summary.operatingMarginPct)}
              </Td>
            </Tr>
          </TBodySection>
        </Table>
      )}
    </Section>
  );
}
