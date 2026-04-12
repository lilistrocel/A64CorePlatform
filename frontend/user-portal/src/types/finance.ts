/**
 * Finance / P&L TypeScript Type Definitions
 *
 * These types mirror the backend response shapes for the /api/v1/finance/pnl/* endpoints.
 */

// ============================================================================
// SHARED FILTER PARAMS
// ============================================================================

export interface PnlFilterParams {
  farmId?: string;
  farmingYear?: string;
  startDate?: string;
  endDate?: string;
  includeImputed?: boolean;
  cropName?: string;
}

// ============================================================================
// SUMMARY
// ============================================================================

export interface PnlPeriod {
  startDate: string;
  endDate: string;
  farmingYear?: string;
  label: string;
}

export interface PnlRevenueBreakdown {
  excelConfirmed: number;
  aliasMatched: number;
  imputed: number;
  noData: number;
}

export interface PnlCOGSBreakdown {
  fertilizer: number;
  seeds: number;
  otherInputs: number;
}

export interface PnlOpexBreakdown {
  maintenanceAndRepairs: number;
  assetPurchases: number;
  labor: number;
  logistics: number;
}

export interface PnlOrderCounts {
  total: number;
  paid: number;
  pending: number;
  overdue: number;
}

export interface PnlSummary {
  period: PnlPeriod;
  revenue: number;
  revenueBreakdown: PnlRevenueBreakdown;
  cogs: number;
  cogsBreakdown: PnlCOGSBreakdown;
  grossProfit: number;
  grossMarginPct: number;
  opex: number;
  opexBreakdown: PnlOpexBreakdown;
  operatingProfit: number;
  operatingMarginPct: number;
  totalKgSold: number;
  orderCounts: PnlOrderCounts;
  totalOutstandingAr: number;
}

// ============================================================================
// MONTHLY TIME SERIES
// ============================================================================

export interface PnlMonthlyDataPoint {
  yearMonth: string;       // e.g. "2024-07"
  revenue: number;
  cogs: number;
  grossProfit: number;
  opex: number;
  operatingProfit: number;
  netProfit: number;
  kgSold: number;
  orderCount: number;
}

export interface PnlByMonthResponse {
  period: PnlPeriod;
  months: PnlMonthlyDataPoint[];
}

// ============================================================================
// BY FARM
// ============================================================================

export interface PnlFarmDataPoint {
  farmId: string;
  farmName: string;
  revenue: number;
  cogs: number;
  grossProfit: number;
  grossMarginPct: number;
  operatingProfit: number;
  kgSold: number;
  orderCount: number;
}

export interface PnlByFarmResponse {
  period: PnlPeriod;
  farms: PnlFarmDataPoint[];
}

// ============================================================================
// BY CROP
// ============================================================================

export interface PnlCropDataPoint {
  cropName: string;
  revenue: number;
  cogs: number;
  grossProfit: number;
  grossMarginPct: number;
  kgSold: number;
  orderCount: number;
  avgPricePerKg: number;
}

export interface PnlByCropResponse {
  period: PnlPeriod;
  crops: PnlCropDataPoint[];
  totalCrops: number;
}

// ============================================================================
// AR AGING
// ============================================================================

export interface ArAgingBucket {
  label: string;       // e.g. "Current (0-30)", "30-60 days", etc.
  minDays: number;
  maxDays: number | null;
  amount: number;
  invoiceCount: number;
  customerCount: number;
}

export interface ArAgingCustomer {
  customerId: string;
  customerName: string;
  totalOutstanding: number;
  current: number;
  days30to60: number;
  days60to90: number;
  days90plus: number;
  oldestInvoiceDays: number;
}

export interface ArAgingResponse {
  asOfDate: string;
  totalOutstanding: number;
  buckets: ArAgingBucket[];
  topCustomers: ArAgingCustomer[];
}

// ============================================================================
// REVENUE SOURCES
// ============================================================================

export interface RevenueSourceDataPoint {
  priceSource: 'excel_match' | 'excel_alias_match' | 'imputed' | 'no_data';
  label: string;
  amount: number;
  pct: number;
  orderCount: number;
}

export interface RevenueSourcesResponse {
  period: PnlPeriod;
  sources: RevenueSourceDataPoint[];
  imputedPct: number;
  totalRevenue: number;
}
