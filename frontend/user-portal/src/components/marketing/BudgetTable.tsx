import styled from 'styled-components';
import { marketingApi } from '../../services/marketingService';
import type { MarketingBudget } from '../../types/marketing';
import { glassPanel, monoLabel } from '@a64core/shared';

interface BudgetTableProps { budgets: MarketingBudget[]; onEdit: (budget: MarketingBudget) => void; onDelete: (budgetId: string) => void; loading?: boolean; }

const TableWrap = styled.div`${glassPanel} border-radius: 16px; overflow: hidden;`;
const Table = styled.table`width: 100%; border-collapse: collapse;`;
const Thead = styled.thead`border-bottom: 1px solid ${({ theme }) => theme.colors.line};`;
const Th = styled.th`${monoLabel} padding: 16px; text-align: left; font-size: 0.66rem; color: ${({ theme }) => theme.colors.celeste};`;
const Tbody = styled.tbody``;
const Tr = styled.tr`border-bottom: 1px solid ${({ theme }) => theme.colors.line}; transition: background 150ms ease-in-out; &:hover { background: rgba(180, 200, 220, 0.05); } &:last-child { border-bottom: none; }`;
const Td = styled.td`padding: 16px; font-size: 14px; color: ${({ theme }) => theme.colors.textPrimary};`;
interface BadgeProps { $color: string; }
/* Status colours flow through marketingApi.getBudgetStatusColor(), routed
   onto colors.phase.* (spec §5.2) — this badge applies the §4 badge visual. */
const Badge = styled.span<BadgeProps>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 99px;
  ${monoLabel}
  font-size: 0.64rem;
  font-weight: 700;
  background: ${({ $color }) => `${$color}29`};
  color: ${({ $color }) => $color};
  border: 1px solid ${({ $color }) => `${$color}73`};

  &::before {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
    box-shadow: 0 0 8px currentColor;
  }
`;
const ActionButton = styled.button`padding: 6px 12px; margin-right: 8px; background: transparent; color: ${({ theme }) => theme.colors.celeste}; border: 1px solid ${({ theme }) => theme.colors.glass.border}; border-radius: 8px; font-size: 13px; cursor: pointer; transition: all 150ms ease-in-out; &:hover { background: rgba(180, 200, 220, 0.07); color: ${({ theme }) => theme.colors.textPrimary}; }`;
const DeleteButton = styled(ActionButton)`color: ${({ theme }) => theme.colors.error}; border-color: ${({ theme }) => theme.colors.error}; &:hover { background: ${({ theme }) => theme.colors.errorBg}; }`;
const EmptyText = styled.div`text-align: center; padding: 48px 24px; color: ${({ theme }) => theme.colors.muted};`;
const ProgressBar = styled.div`width: 100px; height: 10px; background: rgba(10, 14, 36, 0.6); border: 1px solid ${({ theme }) => theme.colors.line}; border-radius: 99px; overflow: hidden;`;
interface ProgressFillProps { $percentage: number; }
/* Utilization gauge — not a phase status, so this stays off the phase
   vocabulary, but still off gold (spec §3): emerald under 75%, terra as it
   approaches the ceiling, coral (the only red) once over budget. */
const ProgressFill = styled.div<ProgressFillProps>`
  height: 100%;
  border-radius: 99px;
  width: ${({ $percentage }) => Math.min($percentage, 100)}%;
  background: ${({ $percentage, theme }) =>
    $percentage >= 90 ? theme.colors.bright.coral : $percentage >= 75 ? theme.colors.bright.terra : theme.colors.bright.emerald};
`;

export function BudgetTable({ budgets, onEdit, onDelete, loading }: BudgetTableProps) {
  if (loading) return <EmptyText>Loading...</EmptyText>;
  if (budgets.length === 0) return <EmptyText>No budgets found</EmptyText>;

  return (
    <TableWrap>
      <Table aria-label="Marketing budgets table">
        <Thead>
          <Tr><Th scope="col">Name</Th><Th scope="col">Year</Th><Th scope="col">Quarter</Th><Th scope="col">Total Amount</Th><Th scope="col">Spent</Th><Th scope="col">Utilization</Th><Th scope="col">Status</Th><Th scope="col">Actions</Th></Tr>
        </Thead>
        <Tbody>
          {budgets.map((budget) => {
            const utilized = marketingApi.calculateBudgetUtilization(budget.spentAmount || 0, budget.totalAmount);
            return (
              <Tr key={budget.budgetId}>
                <Td>{budget.name}</Td>
                <Td>{budget.year}</Td>
                <Td>{budget.quarter ? `Q${budget.quarter}` : 'All'}</Td>
                <Td>{marketingApi.formatCurrency(budget.totalAmount, budget.currency)}</Td>
                <Td>{marketingApi.formatCurrency(budget.spentAmount || 0, budget.currency)}</Td>
                <Td><ProgressBar><ProgressFill $percentage={utilized} /></ProgressBar></Td>
                <Td><Badge $color={marketingApi.getBudgetStatusColor(budget.status)}>{budget.status}</Badge></Td>
                <Td>
                  <ActionButton onClick={() => onEdit(budget)}>Edit</ActionButton>
                  <DeleteButton onClick={() => onDelete(budget.budgetId)}>Delete</DeleteButton>
                </Td>
              </Tr>
            );
          })}
        </Tbody>
      </Table>
    </TableWrap>
  );
}
