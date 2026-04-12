/**
 * Finance API Service
 *
 * Typed API calls for the P&L (Profit & Loss) module.
 * All endpoints are under /api/v1/finance/pnl/*
 */

import { apiClient } from './api';
import type {
  PnlFilterParams,
  PnlSummary,
  PnlByMonthResponse,
  PnlByFarmResponse,
  PnlByCropResponse,
  ArAgingResponse,
  RevenueSourcesResponse,
} from '../types/finance';

// ─── Shared query-param builder ───────────────────────────────────────────────

function buildPnlParams(filters: PnlFilterParams): Record<string, string | number | boolean> {
  const params: Record<string, string | number | boolean> = {};

  if (filters.farmId) params.farmId = filters.farmId;
  // Backend expects int (e.g. 2024) — strip "FY" prefix if present
  if (filters.farmingYear) {
    const fy = String(filters.farmingYear).replace(/^FY/i, '');
    const fyInt = parseInt(fy, 10);
    if (!isNaN(fyInt)) params.farmingYear = fyInt;
  }
  if (filters.startDate) params.startDate = filters.startDate;
  if (filters.endDate) params.endDate = filters.endDate;
  if (filters.cropName) params.cropName = filters.cropName;
  // Only send the flag explicitly; omit when true to keep URLs clean
  if (filters.includeImputed === false) params.includeImputed = false;

  return params;
}

// ─── Endpoint functions ───────────────────────────────────────────────────────

/**
 * GET /api/v1/finance/pnl/summary
 * Returns key KPI numbers for the selected filters.
 */
export async function getPnlSummary(filters: PnlFilterParams = {}): Promise<PnlSummary> {
  interface BackendSummary {
    revenue: { gross: number; tax: number; net: number; lineCount: number;
      paidAmount: number; unpaidAmount: number; collectionRate: number;
      bySource: Record<string, number> };
    cogs: { total: number; allocatedByCrop: number; allocatedByFarm: number; unallocatedOverhead: number };
    grossProfit: number; grossMarginPercent: number;
    opex: { total: number; logistics: number; maintenance: number; labor: number; other: number };
    operatingProfit: number; operatingMarginPercent: number;
    kg: { sold: number; harvested: number };
    orders: { total: number; paid: number; pending: number; partial: number };
    period: { start: string; end: string };
  }
  const response = await apiClient.get<BackendSummary>('/v1/finance/pnl/summary', {
    params: buildPnlParams(filters),
  });
  const b = response.data;
  return {
    period: {
      startDate: b.period?.start || '',
      endDate: b.period?.end || '',
      farmingYear: filters.farmingYear ? String(filters.farmingYear) : undefined,
      label: filters.farmingYear ? `FY${filters.farmingYear}` : 'All time',
    },
    revenue: b.revenue?.net || 0,
    revenueBreakdown: {
      excelConfirmed: b.revenue?.bySource?.excel_match || 0,
      aliasMatched: b.revenue?.bySource?.excel_alias_match || 0,
      imputed: b.revenue?.bySource?.imputed_customer_crop_avg || 0,
      noData: b.revenue?.bySource?.no_data || 0,
    },
    cogs: b.cogs?.total || 0,
    cogsBreakdown: {
      fertilizer: b.cogs?.allocatedByCrop || 0,
      seeds: 0,
      otherInputs: (b.cogs?.allocatedByFarm || 0) + (b.cogs?.unallocatedOverhead || 0),
    },
    grossProfit: b.grossProfit || 0,
    grossMarginPct: b.grossMarginPercent || 0,
    opex: b.opex?.total || 0,
    opexBreakdown: {
      maintenanceAndRepairs: b.opex?.maintenance || 0,
      assetPurchases: b.opex?.other || 0,
      labor: b.opex?.labor || 0,
      logistics: b.opex?.logistics || 0,
    },
    operatingProfit: b.operatingProfit || 0,
    operatingMarginPct: b.operatingMarginPercent || 0,
    totalKgSold: b.kg?.sold || 0,
    orderCounts: {
      total: b.orders?.total || 0,
      paid: b.orders?.paid || 0,
      pending: b.orders?.pending || 0,
      overdue: b.orders?.partial || 0,
    },
    totalOutstandingAr: b.revenue?.unpaidAmount || 0,
  };
}

/**
 * GET /api/v1/finance/pnl/by-month
 */
export async function getPnlByMonth(filters: PnlFilterParams = {}): Promise<PnlByMonthResponse> {
  interface BackendMonth {
    yearMonth: string; revenue: number; cogs: number; opex: number;
    grossProfit: number; netProfit: number; kgSold: number; orderCount: number;
  }
  const response = await apiClient.get<BackendMonth[]>('/v1/finance/pnl/by-month', {
    params: buildPnlParams(filters),
  });
  return {
    period: { startDate: '', endDate: '', label: 'All time' },
    months: (response.data || []).map((m) => ({
      yearMonth: m.yearMonth,
      revenue: m.revenue || 0,
      cogs: m.cogs || 0,
      grossProfit: m.grossProfit || 0,
      opex: m.opex || 0,
      operatingProfit: (m.grossProfit || 0) - (m.opex || 0),
      netProfit: m.netProfit || 0,
      kgSold: m.kgSold || 0,
      orderCount: m.orderCount || 0,
    })),
  };
}

/**
 * GET /api/v1/finance/pnl/by-farm
 */
export async function getPnlByFarm(filters: PnlFilterParams = {}): Promise<PnlByFarmResponse> {
  interface BackendFarm {
    farmId: string; farmName: string; revenue: number; cogs: number;
    grossProfit: number; marginPercent: number; kgSold: number; orderCount: number;
  }
  const response = await apiClient.get<BackendFarm[]>('/v1/finance/pnl/by-farm', {
    params: buildPnlParams(filters),
  });
  return {
    period: { startDate: '', endDate: '', label: 'All time' },
    farms: (response.data || []).map((f) => ({
      farmId: f.farmId,
      farmName: f.farmName || 'Unassigned',
      revenue: f.revenue || 0,
      cogs: f.cogs || 0,
      grossProfit: f.grossProfit || 0,
      grossMarginPct: f.marginPercent || 0,
      operatingProfit: f.grossProfit || 0,
      kgSold: f.kgSold || 0,
      orderCount: f.orderCount || 0,
    })),
  };
}

/**
 * GET /api/v1/finance/pnl/by-crop
 */
export async function getPnlByCrop(filters: PnlFilterParams = {}): Promise<PnlByCropResponse> {
  interface BackendCrop {
    cropName: string; revenue: number; cogs: number; grossProfit: number;
    kgSold: number; avgPricePerKg: number;
  }
  const response = await apiClient.get<BackendCrop[]>('/v1/finance/pnl/by-crop', {
    params: buildPnlParams(filters),
  });
  const crops = (response.data || []).map((c) => ({
    cropName: c.cropName || 'Unknown',
    revenue: c.revenue || 0,
    cogs: c.cogs || 0,
    grossProfit: c.grossProfit || 0,
    grossMarginPct: c.revenue ? ((c.grossProfit || 0) / c.revenue) * 100 : 0,
    kgSold: c.kgSold || 0,
    orderCount: 0,
    avgPricePerKg: c.avgPricePerKg || 0,
  }));
  return {
    period: { startDate: '', endDate: '', label: 'All time' },
    crops,
    totalCrops: crops.length,
  };
}

/**
 * GET /api/v1/finance/pnl/ar-aging
 * Returns accounts receivable aging buckets and top customers.
 */
export async function getArAging(filters: PnlFilterParams = {}): Promise<ArAgingResponse> {
  // Backend returns a flat shape: { current:{count,amount}, aging_30_60:{...}, aging_60_90:{...},
  // over_90:{...}, total_outstanding, byCustomer[{customerId,customerName,outstanding,overdue,orderCount}] }
  // Frontend expects: { asOfDate, totalOutstanding, buckets[...], topCustomers[...] }
  // Adapt at the service layer.
  interface BackendBucket { count: number; amount: number }
  interface BackendCustomer {
    customerId: string; customerName: string; outstanding: number;
    overdue: number; orderCount: number;
  }
  interface BackendArAging {
    current: BackendBucket;
    aging_30_60: BackendBucket;
    aging_60_90: BackendBucket;
    over_90: BackendBucket;
    total_outstanding: number;
    byCustomer: BackendCustomer[];
  }

  const response = await apiClient.get<BackendArAging>('/v1/finance/pnl/ar-aging', {
    params: buildPnlParams(filters),
  });
  const b = response.data;

  return {
    asOfDate: new Date().toISOString().slice(0, 10),
    totalOutstanding: b.total_outstanding || 0,
    buckets: [
      { label: 'Current (0-30)', minDays: 0, maxDays: 30,
        amount: b.current?.amount || 0, invoiceCount: b.current?.count || 0, customerCount: 0 },
      { label: '30-60 days', minDays: 30, maxDays: 60,
        amount: b.aging_30_60?.amount || 0, invoiceCount: b.aging_30_60?.count || 0, customerCount: 0 },
      { label: '60-90 days', minDays: 60, maxDays: 90,
        amount: b.aging_60_90?.amount || 0, invoiceCount: b.aging_60_90?.count || 0, customerCount: 0 },
      { label: '90+ days', minDays: 90, maxDays: null,
        amount: b.over_90?.amount || 0, invoiceCount: b.over_90?.count || 0, customerCount: 0 },
    ],
    topCustomers: (b.byCustomer || []).map((c) => ({
      customerId: c.customerId,
      customerName: c.customerName,
      totalOutstanding: c.outstanding || 0,
      current: Math.max(0, (c.outstanding || 0) - (c.overdue || 0)),
      days30to60: 0,
      days60to90: 0,
      days90plus: c.overdue || 0,
      oldestInvoiceDays: 0,
    })),
  };
}

/**
 * GET /api/v1/finance/pnl/revenue-sources
 * Returns revenue broken down by price-source confidence level.
 */
export async function getRevenueSources(filters: PnlFilterParams = {}): Promise<RevenueSourcesResponse> {
  // Backend returns: {excel_match:{lineCount,revenue,orderCount}, excel_alias_match:{...},
  // imputed_customer_crop_avg:{...}, no_data:{...}}
  interface SourceBucket { lineCount: number; revenue: number; orderCount: number }
  type BackendSources = Record<string, SourceBucket>;
  const response = await apiClient.get<BackendSources>('/v1/finance/pnl/revenue-sources', {
    params: buildPnlParams(filters),
  });
  const b = response.data || {};
  const labelMap: Record<string, { key: 'excel_match'|'excel_alias_match'|'imputed'|'no_data'; label: string }> = {
    excel_match: { key: 'excel_match', label: 'Excel Confirmed' },
    excel_alias_match: { key: 'excel_alias_match', label: 'Alias Matched' },
    imputed_customer_crop_avg: { key: 'imputed', label: 'Imputed (avg price)' },
    no_data: { key: 'no_data', label: 'No Price Data' },
  };
  const total = Object.values(b).reduce((s, v) => s + (v?.revenue || 0), 0);
  const sources = Object.entries(b).map(([k, v]) => {
    const meta = labelMap[k] || { key: 'no_data' as const, label: k };
    return {
      priceSource: meta.key,
      label: meta.label,
      amount: v?.revenue || 0,
      pct: total > 0 ? ((v?.revenue || 0) / total) * 100 : 0,
      orderCount: v?.orderCount || 0,
    };
  });
  return {
    period: { startDate: '', endDate: '', label: 'All time' },
    sources,
  };
}
