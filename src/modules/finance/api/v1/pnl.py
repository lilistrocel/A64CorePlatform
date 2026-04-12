"""
Finance Module - P&L API Routes

All endpoints are read-only aggregation endpoints.
Authentication: Bearer JWT (A64Core standard).
Permission: finance.view (all authenticated roles).

Routes registered at /api/v1/finance/pnl/*
"""

from __future__ import annotations

from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
import logging

from ...models.pnl import (
    ARAgingResponse,
    CropBucket,
    FarmBucket,
    MonthlyBucket,
    PnLSummaryResponse,
    RevenueSourcesResponse,
)
from ...middleware.auth import CurrentUser, require_permission
from ...services.finance.pnl_service import PnLService

logger = logging.getLogger(__name__)

router = APIRouter()


def get_pnl_service() -> PnLService:
    """Dependency injection for PnLService."""
    return PnLService()


# ---------------------------------------------------------------------------
# GET /summary
# ---------------------------------------------------------------------------

@router.get(
    "/summary",
    response_model=PnLSummaryResponse,
    summary="P&L summary",
    description=(
        "Top-level P&L snapshot: revenue, COGS, gross profit, opex, operating profit, "
        "kg volumes and order counts. Supports filtering by farm, farming year, date range, "
        "and price-source confidence. Requires finance.view permission."
    ),
)
async def get_pnl_summary(
    farmId: Optional[str] = Query(
        None,
        description="Filter to a single farm UUID"
    ),
    farmingYear: Optional[int] = Query(
        None,
        ge=2000, le=2100,
        description="Filter to a farming year (e.g. 2025)"
    ),
    startDate: Optional[date] = Query(
        None,
        description="Custom range start date (YYYY-MM-DD)"
    ),
    endDate: Optional[date] = Query(
        None,
        description="Custom range end date (YYYY-MM-DD)"
    ),
    includeImputed: bool = Query(
        True,
        description="Include imputed revenue lines (metadata.priceSource=imputed_customer_crop_avg). "
                    "Set false to show only excel_match and excel_alias_match lines."
    ),
    priceSourceFilter: Optional[str] = Query(
        None,
        description="Restrict to a single priceSource value: "
                    "excel_match | excel_alias_match | imputed_customer_crop_avg | no_data"
    ),
    current_user: CurrentUser = Depends(require_permission("finance.view")),
    service: PnLService = Depends(get_pnl_service),
) -> PnLSummaryResponse:
    """Return P&L summary for the requested scope."""
    try:
        data = await service.get_summary(
            farm_id=farmId,
            farming_year=farmingYear,
            start_date=startDate,
            end_date=endDate,
            include_imputed=includeImputed,
            price_source_filter=priceSourceFilter,
        )
        return PnLSummaryResponse(**data)
    except Exception as exc:
        logger.exception("Error computing P&L summary")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to compute P&L summary"
        ) from exc


# ---------------------------------------------------------------------------
# GET /by-month
# ---------------------------------------------------------------------------

@router.get(
    "/by-month",
    response_model=List[MonthlyBucket],
    summary="P&L by month",
    description=(
        "Monthly P&L time series sorted ascending by yearMonth. "
        "Suitable for revenue/profit trend charts."
    ),
)
async def get_pnl_by_month(
    farmId: Optional[str] = Query(None, description="Filter to a single farm UUID"),
    farmingYear: Optional[int] = Query(None, ge=2000, le=2100),
    startDate: Optional[date] = Query(None),
    endDate: Optional[date] = Query(None),
    includeImputed: bool = Query(True),
    priceSourceFilter: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(require_permission("finance.view")),
    service: PnLService = Depends(get_pnl_service),
) -> List[MonthlyBucket]:
    """Return monthly P&L buckets."""
    try:
        rows = await service.get_by_month(
            farm_id=farmId,
            farming_year=farmingYear,
            start_date=startDate,
            end_date=endDate,
            include_imputed=includeImputed,
            price_source_filter=priceSourceFilter,
        )
        return [MonthlyBucket(**row) for row in rows]
    except Exception as exc:
        logger.exception("Error computing monthly P&L")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to compute monthly P&L"
        ) from exc


# ---------------------------------------------------------------------------
# GET /by-farm
# ---------------------------------------------------------------------------

@router.get(
    "/by-farm",
    response_model=List[FarmBucket],
    summary="P&L by farm",
    description=(
        "P&L breakdown per farm, sorted by revenue descending. "
        "All farms are included even if revenue is zero."
    ),
)
async def get_pnl_by_farm(
    farmingYear: Optional[int] = Query(None, ge=2000, le=2100),
    startDate: Optional[date] = Query(None),
    endDate: Optional[date] = Query(None),
    includeImputed: bool = Query(True),
    priceSourceFilter: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(require_permission("finance.view")),
    service: PnLService = Depends(get_pnl_service),
) -> List[FarmBucket]:
    """Return per-farm P&L breakdown."""
    try:
        rows = await service.get_by_farm(
            farming_year=farmingYear,
            start_date=startDate,
            end_date=endDate,
            include_imputed=includeImputed,
            price_source_filter=priceSourceFilter,
        )
        return [FarmBucket(**row) for row in rows]
    except Exception as exc:
        logger.exception("Error computing farm P&L")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to compute farm P&L"
        ) from exc


# ---------------------------------------------------------------------------
# GET /by-crop
# ---------------------------------------------------------------------------

@router.get(
    "/by-crop",
    response_model=List[CropBucket],
    summary="P&L by crop (top 20)",
    description=(
        "Top 20 crops by net revenue. Includes COGS allocation from purchase_register "
        "items that have a mappedCropName."
    ),
)
async def get_pnl_by_crop(
    farmId: Optional[str] = Query(None, description="Filter to a single farm UUID"),
    farmingYear: Optional[int] = Query(None, ge=2000, le=2100),
    startDate: Optional[date] = Query(None),
    endDate: Optional[date] = Query(None),
    includeImputed: bool = Query(True),
    priceSourceFilter: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(require_permission("finance.view")),
    service: PnLService = Depends(get_pnl_service),
) -> List[CropBucket]:
    """Return top-20 crops by revenue with COGS breakdown."""
    try:
        rows = await service.get_by_crop(
            farm_id=farmId,
            farming_year=farmingYear,
            start_date=startDate,
            end_date=endDate,
            include_imputed=includeImputed,
            price_source_filter=priceSourceFilter,
        )
        return [CropBucket(**row) for row in rows]
    except Exception as exc:
        logger.exception("Error computing crop P&L")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to compute crop P&L"
        ) from exc


# ---------------------------------------------------------------------------
# GET /ar-aging
# ---------------------------------------------------------------------------

@router.get(
    "/ar-aging",
    response_model=ARAgingResponse,
    summary="Accounts Receivable aging",
    description=(
        "AR aging buckets: current (0–30d), 30–60d, 60–90d, >90d. "
        "Invoice date is taken as orderDate. "
        "Returns only orders with paymentStatus=pending or partial and outstanding > 0."
    ),
)
async def get_ar_aging(
    farmId: Optional[str] = Query(None, description="Filter to a single farm UUID"),
    farmingYear: Optional[int] = Query(None, ge=2000, le=2100),
    current_user: CurrentUser = Depends(require_permission("finance.view")),
    service: PnLService = Depends(get_pnl_service),
) -> ARAgingResponse:
    """Return AR aging buckets and top-10 customer breakdown."""
    try:
        data = await service.get_ar_aging(
            farm_id=farmId,
            farming_year=farmingYear,
        )
        return ARAgingResponse(**data)
    except Exception as exc:
        logger.exception("Error computing AR aging")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to compute AR aging"
        ) from exc


# ---------------------------------------------------------------------------
# GET /revenue-sources
# ---------------------------------------------------------------------------

@router.get(
    "/revenue-sources",
    response_model=RevenueSourcesResponse,
    summary="Revenue by price-source confidence",
    description=(
        "Breakdown of revenue by how prices were determined: "
        "excel_match (highest confidence), excel_alias_match, "
        "imputed_customer_crop_avg (estimated), no_data (zero revenue). "
        "Use this to quantify data quality risk in revenue figures."
    ),
)
async def get_revenue_sources(
    farmId: Optional[str] = Query(None, description="Filter to a single farm UUID"),
    farmingYear: Optional[int] = Query(None, ge=2000, le=2100),
    startDate: Optional[date] = Query(None),
    endDate: Optional[date] = Query(None),
    current_user: CurrentUser = Depends(require_permission("finance.view")),
    service: PnLService = Depends(get_pnl_service),
) -> RevenueSourcesResponse:
    """Return revenue breakdown by price-source confidence level."""
    try:
        data = await service.get_revenue_sources(
            farm_id=farmId,
            farming_year=farmingYear,
            start_date=startDate,
            end_date=endDate,
        )
        return RevenueSourcesResponse(**data)
    except Exception as exc:
        logger.exception("Error computing revenue sources")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to compute revenue sources"
        ) from exc
