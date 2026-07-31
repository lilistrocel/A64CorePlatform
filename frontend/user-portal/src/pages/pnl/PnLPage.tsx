/**
 * PnLPage — Profit & Loss Dashboard
 *
 * Route: /pnl (inside MainLayout, protected)
 * Permission: user.role === 'super_admin' OR user.permissions includes 'finance.view'
 *
 * Layout (top to bottom):
 *   1. Header + PnlFiltersBar
 *   2. KPI Cards
 *   3. Revenue Trend Chart
 *   4. Revenue Breakdown (by farm / by crop)
 *   5. P&L Statement Table
 *   6. AR Aging
 *   7. Revenue Confidence
 *
 * All filters are reflected in URL query params so links are shareable.
 */

import { useCallback, useEffect, useMemo } from 'react';
import { useSearchParams, Navigate } from 'react-router-dom';
import styled from 'styled-components';
import { Lock } from 'lucide-react';
import { PageHeader, type PageHeaderStat } from '@a64core/shared';
import { useAuthStore } from '../../stores/auth.store';
import { getFarms } from '../../services/farmApi';
import { useQuery } from '@tanstack/react-query';
import {
  useFinancePnlSummary,
  useFinancePnlByMonth,
  useFinancePnlByFarm,
  useFinancePnlByCrop,
  useFinancePnlArAging,
  useFinanceRevenueSources,
} from '../../hooks/useFinancePnl';
import { PnlFiltersBar } from '../../components/pnl/PnlFiltersBar';
import { PnlKpiCards } from '../../components/pnl/PnlKpiCards';
import { PnlRevenueTrendChart } from '../../components/pnl/PnlRevenueTrendChart';
import { PnlBreakdownCharts } from '../../components/pnl/PnlBreakdownCharts';
import { PnlStatementTable } from '../../components/pnl/PnlStatementTable';
import { PnlArAging } from '../../components/pnl/PnlArAging';
import { PnlRevenueConfidence } from '../../components/pnl/PnlRevenueConfidence';
import type { PnlFilterParams } from '../../types/finance';
import type { Farm } from '../../types/farm';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Public filter state used by the page and passed down to sub-components.
 * URL params are the source of truth; local state is derived.
 */
export interface PnlFilters {
  farmId: string;
  farmingYear: string;
  startDate: string;
  endDate: string;
  includeImputed: boolean;
  cropName: string;
}

// ─── Permission helper ────────────────────────────────────────────────────────

function hasFinanceAccess(user: ReturnType<typeof useAuthStore>['user']): boolean {
  if (!user) return false;
  if (user.role === 'super_admin') return true;
  // Check permissions array (if it exists on the user object)
  const perms = (user as unknown as { permissions?: string[] }).permissions;
  if (Array.isArray(perms) && perms.includes('finance.view')) return true;
  return false;
}

// ─── URL <-> filter helpers ───────────────────────────────────────────────────

function searchParamsToFilters(params: URLSearchParams): PnlFilters {
  return {
    farmId: params.get('farmId') || '',
    farmingYear: params.get('farmingYear') || '',
    startDate: params.get('startDate') || '',
    endDate: params.get('endDate') || '',
    includeImputed: params.get('includeImputed') !== 'false',
    cropName: params.get('cropName') || '',
  };
}

function filtersToApiParams(filters: PnlFilters): PnlFilterParams {
  const params: PnlFilterParams = {};
  if (filters.farmId) params.farmId = filters.farmId;
  if (filters.farmingYear && filters.farmingYear !== 'custom') {
    params.farmingYear = filters.farmingYear;
  }
  if (filters.farmingYear === 'custom') {
    if (filters.startDate) params.startDate = filters.startDate;
    if (filters.endDate) params.endDate = filters.endDate;
  }
  if (!filters.includeImputed) params.includeImputed = false;
  if (filters.cropName) params.cropName = filters.cropName;
  return params;
}

// ─── Styled Components ────────────────────────────────────────────────────────

const Container = styled.div`
  padding: ${({ theme }) => theme.spacing.xl};
  max-width: 1440px;
  margin: 0 auto;

  @media (max-width: ${({ theme }) => theme.breakpoints.tablet}) {
    padding: ${({ theme }) => theme.spacing.lg};
  }
`;

const AccessDeniedIconWrap = styled.div`
  color: ${({ theme }) => theme.colors.muted};
  display: flex;
`;

const AccessDenied = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  gap: ${({ theme }) => theme.spacing.md};
  color: ${({ theme }) => theme.colors.muted};
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  text-align: center;
  padding: ${({ theme }) => theme.spacing.xl};

  strong {
    color: ${({ theme }) => theme.colors.textPrimary};
    font-size: ${({ theme }) => theme.typography.fontSize.lg};
  }
`;

// ─── Component ────────────────────────────────────────────────────────────────

export function PnLPage() {
  const { user } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();

  // Permission gate
  if (!hasFinanceAccess(user)) {
    return (
      <Container>
        <AccessDenied role="alert">
          <AccessDeniedIconWrap aria-hidden="true"><Lock size={40} strokeWidth={1.4} /></AccessDeniedIconWrap>
          <strong>Access Restricted</strong>
          <p>You do not have permission to view the P&amp;L dashboard.</p>
          <p>Contact your administrator to request &quot;finance.view&quot; access.</p>
        </AccessDenied>
      </Container>
    );
  }

  // Derive current filters from URL
  const filters = useMemo(
    () => searchParamsToFilters(searchParams),
    [searchParams]
  );

  // Convert UI filter state to API params
  const apiParams = useMemo(() => filtersToApiParams(filters), [filters]);

  // ── Filter change handler ────────────────────────────────────────────────
  const handleFilterChange = useCallback(
    (next: Partial<PnlFilters>) => {
      const updated = { ...filters, ...next };
      const params = new URLSearchParams();

      if (updated.farmId) params.set('farmId', updated.farmId);
      if (updated.farmingYear) params.set('farmingYear', updated.farmingYear);
      if (updated.farmingYear === 'custom') {
        if (updated.startDate) params.set('startDate', updated.startDate);
        if (updated.endDate) params.set('endDate', updated.endDate);
      }
      if (!updated.includeImputed) params.set('includeImputed', 'false');
      if (updated.cropName) params.set('cropName', updated.cropName);

      setSearchParams(params, { replace: true });
    },
    [filters, setSearchParams]
  );

  // ── Load farm list for dropdown ──────────────────────────────────────────
  const farmsQuery = useQuery({
    queryKey: ['farms', 'all-for-pnl'],
    queryFn: () => getFarms(1, 100),
    staleTime: 10 * 60 * 1000, // 10 min — farm list rarely changes
  });

  const farmOptions = useMemo(
    () =>
      (farmsQuery.data?.items as Farm[] ?? []).map((f) => ({
        farmId: f.farmId,
        farmName: f.farmName,
      })),
    [farmsQuery.data]
  );

  // ── Data queries ─────────────────────────────────────────────────────────
  const summaryQuery = useFinancePnlSummary(apiParams);
  const byMonthQuery = useFinancePnlByMonth(apiParams);
  const byFarmQuery = useFinancePnlByFarm(apiParams);
  const byCropQuery = useFinancePnlByCrop(apiParams);
  const arAgingQuery = useFinancePnlArAging(apiParams);
  const revenueSourcesQuery = useFinanceRevenueSources(apiParams);

  // ── Bar click handlers to update filters ────────────────────────────────
  const handleFarmClick = useCallback(
    (farmId: string) => handleFilterChange({ farmId }),
    [handleFilterChange]
  );

  const handleCropClick = useCallback(
    (cropName: string) => handleFilterChange({ cropName }),
    [handleFilterChange]
  );

  // Derive the period label from summary or a sensible fallback
  const periodLabel =
    summaryQuery.data?.period?.label ||
    (filters.farmingYear ? filters.farmingYear : 'All time');

  const headerStats: PageHeaderStat[] = [{ value: periodLabel, label: 'Period' }];

  return (
    <Container>
      {/* ── Header ─────────────────────────────────────────────────── */}
      <PageHeader
        breadcrumb="Finance · Live"
        title="Profit & Loss"
        emphasizeLastWord
        description="Financial performance overview — revenue, margins, and accounts receivable"
        stats={headerStats}
      />

      {/* ── Filters ────────────────────────────────────────────────── */}
      <PnlFiltersBar
        filters={filters}
        farms={farmOptions}
        farmsLoading={farmsQuery.isLoading}
        onChange={handleFilterChange}
      />

      {/* ── KPI Cards ──────────────────────────────────────────────── */}
      <PnlKpiCards
        summary={summaryQuery.data}
        isLoading={summaryQuery.isLoading}
        isError={summaryQuery.isError}
        onRetry={() => summaryQuery.refetch()}
      />

      {/* ── Revenue Trend Chart ─────────────────────────────────────── */}
      <PnlRevenueTrendChart
        months={byMonthQuery.data?.months}
        isLoading={byMonthQuery.isLoading}
        isError={byMonthQuery.isError}
        onRetry={() => byMonthQuery.refetch()}
      />

      {/* ── Revenue Breakdown (by farm + by crop) ───────────────────── */}
      <PnlBreakdownCharts
        farms={byFarmQuery.data?.farms}
        farmsLoading={byFarmQuery.isLoading}
        farmsError={byFarmQuery.isError}
        crops={byCropQuery.data?.crops}
        cropsLoading={byCropQuery.isLoading}
        cropsError={byCropQuery.isError}
        onFarmClick={handleFarmClick}
        onCropClick={handleCropClick}
        onFarmsRetry={() => byFarmQuery.refetch()}
        onCropsRetry={() => byCropQuery.refetch()}
      />

      {/* ── P&L Statement Table ─────────────────────────────────────── */}
      <PnlStatementTable
        summary={summaryQuery.data}
        isLoading={summaryQuery.isLoading}
        isError={summaryQuery.isError}
        onRetry={() => summaryQuery.refetch()}
      />

      {/* ── AR Aging ────────────────────────────────────────────────── */}
      <PnlArAging
        data={arAgingQuery.data}
        isLoading={arAgingQuery.isLoading}
        isError={arAgingQuery.isError}
        onRetry={() => arAgingQuery.refetch()}
      />

      {/* ── Revenue Confidence ──────────────────────────────────────── */}
      <PnlRevenueConfidence
        data={revenueSourcesQuery.data}
        isLoading={revenueSourcesQuery.isLoading}
        isError={revenueSourcesQuery.isError}
        onRetry={() => revenueSourcesQuery.refetch()}
      />
    </Container>
  );
}
