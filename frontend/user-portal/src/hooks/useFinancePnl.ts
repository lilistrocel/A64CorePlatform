/**
 * TanStack Query hooks for the Finance / P&L module.
 *
 * All hooks share the same PnlFilterParams so query keys change automatically
 * when the user changes filters (farm, year, date range, imputed toggle).
 *
 * Stale time is set to 5 minutes — this is aggregated reporting data that
 * does not require real-time freshness.
 */

import { useQuery } from '@tanstack/react-query';
import {
  getPnlSummary,
  getPnlByMonth,
  getPnlByFarm,
  getPnlByCrop,
  getArAging,
  getRevenueSources,
} from '../services/financeService';
import type { PnlFilterParams } from '../types/finance';

const STALE_TIME = 5 * 60 * 1000; // 5 minutes

// ─── Query key factory ────────────────────────────────────────────────────────

export const pnlQueryKeys = {
  all: ['finance', 'pnl'] as const,
  summary: (filters: PnlFilterParams) =>
    [...pnlQueryKeys.all, 'summary', filters] as const,
  byMonth: (filters: PnlFilterParams) =>
    [...pnlQueryKeys.all, 'by-month', filters] as const,
  byFarm: (filters: PnlFilterParams) =>
    [...pnlQueryKeys.all, 'by-farm', filters] as const,
  byCrop: (filters: PnlFilterParams) =>
    [...pnlQueryKeys.all, 'by-crop', filters] as const,
  arAging: (filters: PnlFilterParams) =>
    [...pnlQueryKeys.all, 'ar-aging', filters] as const,
  revenueSources: (filters: PnlFilterParams) =>
    [...pnlQueryKeys.all, 'revenue-sources', filters] as const,
} as const;

// ─── Individual hooks ─────────────────────────────────────────────────────────

/**
 * Fetches KPI summary (revenue, profit, margin, orders, kg sold, AR).
 */
export function useFinancePnlSummary(filters: PnlFilterParams = {}) {
  return useQuery({
    queryKey: pnlQueryKeys.summary(filters),
    queryFn: () => getPnlSummary(filters),
    staleTime: STALE_TIME,
  });
}

/**
 * Fetches monthly time-series for revenue trend chart.
 */
export function useFinancePnlByMonth(filters: PnlFilterParams = {}) {
  return useQuery({
    queryKey: pnlQueryKeys.byMonth(filters),
    queryFn: () => getPnlByMonth(filters),
    staleTime: STALE_TIME,
  });
}

/**
 * Fetches per-farm revenue breakdown for horizontal bar chart.
 */
export function useFinancePnlByFarm(filters: PnlFilterParams = {}) {
  return useQuery({
    queryKey: pnlQueryKeys.byFarm(filters),
    queryFn: () => getPnlByFarm(filters),
    staleTime: STALE_TIME,
  });
}

/**
 * Fetches top crops by revenue for horizontal bar chart.
 */
export function useFinancePnlByCrop(filters: PnlFilterParams = {}) {
  return useQuery({
    queryKey: pnlQueryKeys.byCrop(filters),
    queryFn: () => getPnlByCrop(filters),
    staleTime: STALE_TIME,
  });
}

/**
 * Fetches AR aging buckets and top customers by outstanding balance.
 */
export function useFinancePnlArAging(filters: PnlFilterParams = {}) {
  return useQuery({
    queryKey: pnlQueryKeys.arAging(filters),
    queryFn: () => getArAging(filters),
    staleTime: STALE_TIME,
  });
}

/**
 * Fetches revenue confidence breakdown by price source.
 */
export function useFinanceRevenueSources(filters: PnlFilterParams = {}) {
  return useQuery({
    queryKey: pnlQueryKeys.revenueSources(filters),
    queryFn: () => getRevenueSources(filters),
    staleTime: STALE_TIME,
  });
}
