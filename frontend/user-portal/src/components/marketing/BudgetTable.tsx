import styled from 'styled-components';
import { marketingApi } from '../../services/marketingService';
import type { MarketingBudget } from '../../types/marketing';

interface BudgetTableProps { budgets: MarketingBudget[]; onEdit: (budget: MarketingBudget) => void; onDelete: (budgetId: string) => void; loading?: boolean; }

const Table = styled.table`width: 100%; background: white; border-radius: 12px; overflow: hidden; border: 1px solid #e0e0e0;`;
const Thead = styled.thead`background: #fafafa; border-bottom: 2px solid #e0e0e0;`;
const Th = styled.th`padding: 16px; text-align: left; font-size: 13px; font-weight: 600; color: #616161; text-transform: uppercase;`;
const Tbody = styled.tbody``;
const Tr = styled.tr`border-bottom: 1px solid #e0e0e0; &:hover { background: #fafafa; }`;
const Td = styled.td`padding: 16px; font-size: 14px; color: #212121;`;
interface BadgeProps { $color: string; }
const Badge = styled.span<BadgeProps>`padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 500; background: ${({ $color }) => $color}20; color: ${({ $color }) => $color};`;
const ActionButton = styled.button`padding: 6px 12px; margin-right: 8px; background: transparent; border: 1px solid #e0e0e0; border-radius: 6px; font-size: 13px; cursor: pointer; transition: all 150ms ease-in-out; &:hover { background: #f5f5f5; }`;
const DeleteButton = styled(ActionButton)`color: #EF4444; border-color: #EF4444; &:hover { background: #FEE2E2; }`;
const EmptyText = styled.div`text-align: center; padding: 48px 24px; color: #9e9e9e;`;
const ProgressBar = styled.div`width: 100px; height: 8px; background: #e0e0e0; border-radius: 4px; overflow: hidden;`;
interface ProgressFillProps { $percentage: number; }
const ProgressFill = styled.div<ProgressFillProps>`height: 100%; background: ${({ $percentage }) => $percentage >= 90 ? '#EF4444' : $percentage >= 75 ? '#F59E0B' : '#10B981'}; width: ${({ $percentage }) => Math.min($percentage, 100)}%;`;

export function BudgetTable({ budgets, onEdit, onDelete, loading }: BudgetTableProps) {
  if (loading) return <EmptyText>Loading...</EmptyText>;
  if (budgets.length === 0) return <EmptyText>No budgets found</EmptyText>;

  return (
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
  );
}
