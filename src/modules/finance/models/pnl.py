"""
Finance Module - P&L Response Models

Pydantic models for all P&L API response shapes.
All monetary values are in AED as plain floats (frontend is responsible for formatting).
"""

from __future__ import annotations

from typing import Dict, List, Optional
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Shared sub-models
# ---------------------------------------------------------------------------

class PeriodInfo(BaseModel):
    """Date range covered by the query."""
    start: Optional[str] = Field(None, description="ISO date string (YYYY-MM-DD)")
    end: Optional[str] = Field(None, description="ISO date string (YYYY-MM-DD)")


class RevenueBreakdown(BaseModel):
    """Revenue summary with collection and price-source detail."""
    gross: float = Field(0.0, description="Gross revenue before tax (AED)")
    tax: float = Field(0.0, description="Total VAT amount (AED)")
    net: float = Field(0.0, description="Net revenue after tax (AED)")
    lineCount: int = Field(0, description="Number of sales order lines counted")
    paidAmount: float = Field(0.0, description="Total paid amount (AED)")
    unpaidAmount: float = Field(0.0, description="Total unpaid/outstanding amount (AED)")
    collectionRate: float = Field(0.0, description="Paid / net revenue ratio (0–1)")
    bySource: Dict[str, float] = Field(
        default_factory=dict,
        description="Revenue broken down by metadata.priceSource"
    )


class CogsBreakdown(BaseModel):
    """Cost of Goods Sold allocation."""
    total: float = Field(0.0, description="Total COGS (AED)")
    allocatedByCrop: float = Field(0.0, description="Purchase register items with mappedCropName (AED)")
    allocatedByFarm: float = Field(0.0, description="Farm overhead allocated by revenue ratio (AED)")
    unallocatedOverhead: float = Field(0.0, description="Overhead that could not be allocated (AED)")


class OpexBreakdown(BaseModel):
    """Operating expenses breakdown."""
    total: float = Field(0.0, description="Total opex (AED)")
    logistics: float = Field(0.0, description="Vehicle/fuel/logistics costs (AED)")
    maintenance: float = Field(0.0, description="Repair and maintenance costs (AED)")
    labor: float = Field(0.0, description="Labor costs — 0 until HR salary data is available")
    other: float = Field(0.0, description="Other operating expenses (AED)")


class KgSummary(BaseModel):
    """Kilogram volumes."""
    sold: float = Field(0.0, description="Total kg sold (from sales_order_lines)")
    harvested: float = Field(0.0, description="Total kg harvested (from block_harvests)")


class OrderSummary(BaseModel):
    """Order count by payment status."""
    total: int = Field(0, description="Total sales orders")
    paid: int = Field(0, description="Orders with paymentStatus=paid")
    pending: int = Field(0, description="Orders with paymentStatus=pending")
    partial: int = Field(0, description="Orders with paymentStatus=partial")


# ---------------------------------------------------------------------------
# Endpoint response models
# ---------------------------------------------------------------------------

class PnLSummaryResponse(BaseModel):
    """
    Response for GET /api/v1/finance/pnl/summary.

    Top-level P&L snapshot for the requested period/farm/year.
    """
    revenue: RevenueBreakdown
    cogs: CogsBreakdown
    grossProfit: float = Field(0.0, description="revenue.net - cogs.total (AED)")
    grossMarginPercent: float = Field(0.0, description="grossProfit / revenue.net * 100")
    opex: OpexBreakdown
    operatingProfit: float = Field(0.0, description="grossProfit - opex.total (AED)")
    operatingMarginPercent: float = Field(0.0, description="operatingProfit / revenue.net * 100")
    kg: KgSummary
    orders: OrderSummary
    period: PeriodInfo


class MonthlyBucket(BaseModel):
    """Single month bucket for GET /api/v1/finance/pnl/by-month."""
    yearMonth: str = Field(..., description="YYYY-MM format, e.g. 2025-08")
    revenue: float = Field(0.0, description="Net revenue for the month (AED)")
    cogs: float = Field(0.0, description="COGS for the month (AED)")
    opex: float = Field(0.0, description="Opex for the month (AED)")
    grossProfit: float = Field(0.0, description="revenue - cogs (AED)")
    netProfit: float = Field(0.0, description="revenue - cogs - opex (AED)")
    kgSold: float = Field(0.0, description="Total kg sold in the month")
    orderCount: int = Field(0, description="Number of sales orders in the month")


class FarmBucket(BaseModel):
    """Single farm bucket for GET /api/v1/finance/pnl/by-farm."""
    farmId: str
    farmName: str
    revenue: float = Field(0.0, description="Net revenue (AED)")
    cogs: float = Field(0.0, description="Allocated COGS (AED)")
    grossProfit: float = Field(0.0, description="revenue - cogs (AED)")
    marginPercent: float = Field(0.0, description="grossProfit / revenue * 100")
    kgSold: float = Field(0.0, description="Total kg sold")
    orderCount: int = Field(0, description="Number of sales orders")


class CropBucket(BaseModel):
    """Single crop bucket for GET /api/v1/finance/pnl/by-crop."""
    cropName: str
    revenue: float = Field(0.0, description="Net revenue (AED)")
    cogs: float = Field(0.0, description="Allocated COGS (AED)")
    grossProfit: float = Field(0.0, description="revenue - cogs (AED)")
    kgSold: float = Field(0.0, description="Total kg sold")
    avgPricePerKg: float = Field(0.0, description="revenue / kgSold (AED/kg)")


class AgingBucket(BaseModel):
    """Count + amount for one AR aging bucket."""
    count: int = Field(0)
    amount: float = Field(0.0, description="Outstanding amount (AED)")


class CustomerAging(BaseModel):
    """Per-customer AR aging entry."""
    customerId: str
    customerName: str
    outstanding: float = Field(0.0, description="Total unpaid amount (AED)")
    overdue: float = Field(0.0, description="Amount overdue > 30 days (AED)")
    orderCount: int = Field(0)


class ARAgingResponse(BaseModel):
    """Response for GET /api/v1/finance/pnl/ar-aging."""
    current: AgingBucket = Field(default_factory=AgingBucket, description="0–30 days")
    aging_30_60: AgingBucket = Field(default_factory=AgingBucket, description="31–60 days")
    aging_60_90: AgingBucket = Field(default_factory=AgingBucket, description="61–90 days")
    over_90: AgingBucket = Field(default_factory=AgingBucket, description="Over 90 days")
    total_outstanding: float = Field(0.0, description="Sum of all outstanding amounts (AED)")
    byCustomer: List[CustomerAging] = Field(default_factory=list, description="Top 10 customers by outstanding")


class RevenueSourceEntry(BaseModel):
    """Single price-source entry for GET /api/v1/finance/pnl/revenue-sources."""
    lineCount: int = Field(0)
    revenue: float = Field(0.0, description="Total revenue for this source (AED)")
    orderCount: int = Field(0, description="Distinct sales order count")


class RevenueSourcesResponse(BaseModel):
    """Response for GET /api/v1/finance/pnl/revenue-sources."""
    excel_match: RevenueSourceEntry = Field(default_factory=RevenueSourceEntry)
    excel_alias_match: RevenueSourceEntry = Field(default_factory=RevenueSourceEntry)
    imputed_customer_crop_avg: RevenueSourceEntry = Field(default_factory=RevenueSourceEntry)
    no_data: RevenueSourceEntry = Field(default_factory=RevenueSourceEntry)
