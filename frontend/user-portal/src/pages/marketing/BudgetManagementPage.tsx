/**
 * BudgetManagementPage Component - Budget list with CRUD operations
 */

import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { marketingApi } from '../../services/marketingService';
import { BudgetTable } from '../../components/marketing/BudgetTable';
import { BudgetForm } from '../../components/marketing/BudgetForm';
import type { MarketingBudget, BudgetStatus } from '../../types/marketing';

const Container = styled.div`padding: 32px; max-width: 1440px; margin: 0 auto;`;
const Header = styled.div`display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;`;
const Title = styled.h1`font-size: 28px; font-weight: 600; color: #212121; margin: 0;`;
const FilterRow = styled.div`display: flex; gap: 16px; margin-bottom: 24px; flex-wrap: wrap;`;
const SearchInput = styled.input`flex: 1; min-width: 200px; padding: 10px 16px; border: 1px solid #e0e0e0; border-radius: 8px; font-size: 14px; &:focus { outline: none; border-color: #3B82F6; }`;
const Select = styled.select`padding: 10px 16px; border: 1px solid #e0e0e0; border-radius: 8px; font-size: 14px; background: white; cursor: pointer; &:focus { outline: none; border-color: #3B82F6; }`;
const Button = styled.button`padding: 10px 24px; background: #3B82F6; color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; transition: all 150ms ease-in-out; &:hover { background: #1976d2; }`;
const LoadingContainer = styled.div`display: flex; justify-content: center; align-items: center; min-height: 400px; font-size: 16px; color: #9e9e9e;`;
const ErrorContainer = styled.div`background: #FEE2E2; border: 1px solid #EF4444; color: #991B1B; padding: 16px; border-radius: 8px; margin-bottom: 24px;`;

export function BudgetManagementPage() {
  const [budgets, setBudgets] = useState<MarketingBudget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<BudgetStatus | ''>('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [selectedBudget, setSelectedBudget] = useState<MarketingBudget | null>(null);

  useEffect(() => {
    loadBudgets();
  }, [searchTerm, statusFilter, page]);

  const loadBudgets = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await marketingApi.getBudgets({ page, perPage: 20, search: searchTerm || undefined, status: statusFilter || undefined });
      setBudgets(result.items);
      setTotalPages(result.totalPages);
    } catch (err: any) {
      console.error('Failed to load budgets:', err);
      setError(err.response?.data?.message || 'Failed to load budgets');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => { setSelectedBudget(null); setShowForm(true); };
  const handleEdit = (budget: MarketingBudget) => { setSelectedBudget(budget); setShowForm(true); };
  const handleDelete = async (budgetId: string) => {
    if (!confirm('Are you sure you want to delete this budget?')) return;
    try { await marketingApi.deleteBudget(budgetId); loadBudgets(); } catch (err: any) { alert(err.response?.data?.message || 'Failed to delete budget'); }
  };
  const handleFormClose = () => { setShowForm(false); setSelectedBudget(null); loadBudgets(); };

  if (loading && budgets.length === 0) {
    return <Container><LoadingContainer>Loading budgets...</LoadingContainer></Container>;
  }

  return (
    <Container>
      <Header><Title>Budget Management</Title><Button onClick={handleCreate}>Create Budget</Button></Header>
      {error && <ErrorContainer>{error}</ErrorContainer>}
      <FilterRow>
        <SearchInput type="text" placeholder="Search budgets..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as BudgetStatus | '')}>
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="approved">Approved</option>
          <option value="active">Active</option>
          <option value="closed">Closed</option>
        </Select>
      </FilterRow>
      <BudgetTable budgets={budgets} onEdit={handleEdit} onDelete={handleDelete} loading={loading} />
      {showForm && <BudgetForm budget={selectedBudget} onClose={handleFormClose} />}
    </Container>
  );
}
