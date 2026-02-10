"""
Logistics Module - Configuration API Routes

Endpoints for logistics configuration including farming years.
"""

from fastapi import APIRouter, Depends, Query
from typing import List
from datetime import datetime
import logging

from src.modules.logistics.middleware.auth import require_permission, CurrentUser
from src.modules.logistics.services.database import logistics_db
from src.modules.farm_manager.models.farming_year_config import (
    get_farming_year,
    MONTH_NAMES,
    DEFAULT_FARMING_YEAR_START_MONTH
)
from src.modules.farm_manager.services.farming_year_service import get_farming_year_service

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get(
    "/farming-years",
    summary="Get available farming years for logistics",
    description="Get all farming years that have shipment data, plus current year."
)
async def get_logistics_farming_years(
    include_current: bool = Query(True, description="Include current farming year even if no data"),
    current_user: CurrentUser = Depends(require_permission("logistics.view"))
):
    """
    Get all farming years that have shipment data.

    Returns a list of farming years with:
    - year: The farming year number (e.g., 2025)
    - display: Formatted string (e.g., "Aug 2025 - Jul 2026")
    - isCurrent: True if this is the current farming year
    - hasShipments: True if there are shipments in this year
    """
    db = logistics_db.get_database()

    # Get farming year configuration
    fy_service = get_farming_year_service()
    config = await fy_service.get_farming_year_config()
    start_month = config.farmingYearStartMonth

    # Get current farming year
    current_year = get_farming_year(datetime.utcnow(), start_month)

    # Get distinct farming years from shipments collection
    pipeline = [
        {"$match": {"farmingYear": {"$exists": True, "$ne": None}}},
        {"$group": {"_id": "$farmingYear", "count": {"$sum": 1}}},
        {"$sort": {"_id": -1}}
    ]

    cursor = db.shipments.aggregate(pipeline)
    years_with_data = {}
    async for doc in cursor:
        year = doc["_id"]
        count = doc["count"]
        years_with_data[year] = count

    # Build the result list
    result_years = set(years_with_data.keys())

    # Add current year if requested
    if include_current and current_year not in result_years:
        result_years.add(current_year)

    # Format the results
    years_list = []
    for year in sorted(result_years, reverse=True):
        # Calculate display string
        display = fy_service.format_farming_year_display(year, start_month)

        years_list.append({
            "year": year,
            "display": display,
            "isCurrent": year == current_year,
            "hasShipments": year in years_with_data,
            "shipmentCount": years_with_data.get(year, 0)
        })

    # Get start month name
    start_month_name = MONTH_NAMES.get(start_month, "Unknown")

    return {
        "years": years_list,
        "count": len(years_list),
        "currentYear": current_year,
        "startMonth": start_month,
        "startMonthName": start_month_name
    }
