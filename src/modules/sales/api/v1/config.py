"""
Sales Module - Config API Routes

Configuration endpoints for the Sales module.
"""

from fastapi import APIRouter, Depends
import logging

from src.modules.farm_manager.models.farming_year_config import MONTH_NAMES
from src.modules.farm_manager.services.farming_year_service import get_farming_year_service
from ...services.database import sales_db
from ...middleware.auth import require_permission, CurrentUser
from ...utils.responses import SuccessResponse

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get(
    "/farming-years",
    response_model=SuccessResponse[dict],
    summary="Get available farming years for sales",
    description="Get a list of all farming years that have sales order data, used for year selector dropdown."
)
async def get_sales_farming_years(
    current_user: CurrentUser = Depends(require_permission("sales.view"))
):
    """
    Get all farming years that have sales order data.

    Returns a list of farming years found in sales_orders collection,
    sorted newest first. Includes the current farming year even if no data exists.

    Returns:
        years: List of available farming years with:
            - year: The farming year number (e.g., 2025)
            - display: Formatted string like "Aug 2025 - Jul 2026"
            - isCurrent: True if this is the current farming year
            - hasOrders: True if there are orders for this year
            - orderCount: Number of orders for this year
    """
    db = sales_db.get_database()

    # Get farming year service for config and formatting
    fy_service = get_farming_year_service()
    config = await fy_service.get_farming_year_config()
    current_year = await fy_service.get_current_farming_year()

    # Query distinct farmingYear values from sales_orders with counts
    orders_years_cursor = db.sales_orders.aggregate([
        {"$match": {"farmingYear": {"$ne": None}}},
        {"$group": {
            "_id": "$farmingYear",
            "count": {"$sum": 1}
        }},
        {"$sort": {"_id": -1}}
    ])

    orders_years = {}  # year -> count
    async for doc in orders_years_cursor:
        if doc["_id"] is not None:
            orders_years[doc["_id"]] = doc["count"]

    # Combine all years with current year
    all_years = set(orders_years.keys())
    all_years.add(current_year)

    # Sort descending (newest first)
    sorted_years = sorted(all_years, reverse=True)

    # Build response with formatted display strings
    years_list = []
    for year in sorted_years:
        display = fy_service.format_farming_year_display(year, config.farmingYearStartMonth)
        order_count = orders_years.get(year, 0)
        years_list.append({
            "year": year,
            "display": display,
            "isCurrent": year == current_year,
            "hasOrders": year in orders_years,
            "orderCount": order_count
        })

    return SuccessResponse(
        data={
            "years": years_list,
            "count": len(years_list),
            "currentFarmingYear": current_year,
            "totalOrders": sum(orders_years.values()),
            "config": {
                "startMonth": config.farmingYearStartMonth,
                "startMonthName": MONTH_NAMES.get(config.farmingYearStartMonth, "Unknown")
            }
        },
        message=f"Found {len(years_list)} farming years with sales order data"
    )
