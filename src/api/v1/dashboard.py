"""
Dashboard API Endpoints

API routes for CCM Dashboard widget data management.
"""

from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from ...models.dashboard import (
    BulkWidgetDataRequest,
    BulkWidgetDataResponse,
    WidgetDataResponse,
)
from ...models.user import UserResponse
from ...middleware.auth import get_current_active_user
from ...services.dashboard_service import DashboardService
from ...services.database import mongodb

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


# ============================================================================
# Dashboard Summary Models
# ============================================================================


class ModuleSummary(BaseModel):
    """Summary stats for a single module."""
    total: int = Field(..., description="Total count")
    active: Optional[int] = Field(None, description="Active count (if applicable)")
    details: Optional[Dict[str, Any]] = Field(None, description="Additional module-specific details")


class DashboardSummaryResponse(BaseModel):
    """Aggregated dashboard summary response."""
    farms: ModuleSummary = Field(..., description="Farm statistics")
    blocks: ModuleSummary = Field(..., description="Block statistics")
    employees: ModuleSummary = Field(..., description="Employee statistics")
    customers: ModuleSummary = Field(..., description="Customer statistics")
    orders: ModuleSummary = Field(..., description="Sales order statistics")
    vehicles: ModuleSummary = Field(..., description="Vehicle statistics")
    shipments: ModuleSummary = Field(..., description="Shipment statistics")
    campaigns: ModuleSummary = Field(..., description="Marketing campaign statistics")
    users: ModuleSummary = Field(..., description="System user statistics")
    lastUpdated: datetime = Field(default_factory=datetime.utcnow, description="Timestamp of summary generation")


# ============================================================================
# Dashboard Summary Endpoint
# ============================================================================


@router.get(
    "/summary",
    response_model=DashboardSummaryResponse,
    summary="Get aggregated dashboard summary",
    description="Get a single aggregated response with counts from all modules (farms, employees, orders, etc.)",
)
async def get_dashboard_summary(
    current_user: UserResponse = Depends(get_current_active_user),
) -> DashboardSummaryResponse:
    """
    Get aggregated dashboard summary with counts from all modules.

    **Authentication:** Required (JWT token)

    **Permission:** Authenticated users only

    **Returns:**
        Aggregated counts from all modules in a single response:
        - farms: Total farms and active farms
        - blocks: Total blocks with status breakdown
        - employees: Total employees and active employees
        - customers: Total customers and active customers
        - orders: Total orders with status breakdown
        - vehicles: Total vehicles with status breakdown
        - shipments: Total shipments with status breakdown
        - campaigns: Total campaigns and active campaigns
        - users: Total users and active users

    **Example Response:**
    ```json
    {
      "farms": {"total": 42, "active": 40, "details": null},
      "blocks": {"total": 150, "active": 120, "details": {"growing": 80, "harvesting": 20}},
      "employees": {"total": 156, "active": 150, "details": null},
      "customers": {"total": 200, "active": 180, "details": null},
      "orders": {"total": 3304, "active": null, "details": {"delivered": 2, "processing": 5}},
      "vehicles": {"total": 11, "active": 11, "details": {"available": 10, "in_use": 1}},
      "shipments": {"total": 2, "active": null, "details": {"delivered": 2}},
      "campaigns": {"total": 5, "active": 3, "details": null},
      "users": {"total": 37, "active": 35, "details": null},
      "lastUpdated": "2026-02-05T23:30:00.000000"
    }
    ```
    """
    db = mongodb.get_database()

    # Fetch all counts concurrently using aggregation pipelines
    import asyncio

    # Farm counts
    async def get_farm_stats():
        total = await db.farms.count_documents({})
        active = await db.farms.count_documents({"isActive": True})
        return ModuleSummary(total=total, active=active)

    # Block counts with status breakdown
    async def get_block_stats():
        total = await db.blocks.count_documents({})
        active = await db.blocks.count_documents({"isActive": True})
        # Get status breakdown
        pipeline = [
            {"$group": {"_id": "$status", "count": {"$sum": 1}}}
        ]
        status_breakdown = {}
        async for doc in db.blocks.aggregate(pipeline):
            if doc["_id"]:
                status_breakdown[doc["_id"]] = doc["count"]
        return ModuleSummary(total=total, active=active, details=status_breakdown if status_breakdown else None)

    # Employee counts
    async def get_employee_stats():
        total = await db.employees.count_documents({})
        active = await db.employees.count_documents({"status": "active"})
        return ModuleSummary(total=total, active=active)

    # Customer counts
    async def get_customer_stats():
        total = await db.customers.count_documents({})
        active = await db.customers.count_documents({"status": "active"})
        return ModuleSummary(total=total, active=active)

    # Sales order counts with status breakdown
    async def get_order_stats():
        total = await db.sales_orders.count_documents({})
        # Get status breakdown
        pipeline = [
            {"$group": {"_id": "$status", "count": {"$sum": 1}}}
        ]
        status_breakdown = {}
        async for doc in db.sales_orders.aggregate(pipeline):
            if doc["_id"]:
                status_breakdown[doc["_id"]] = doc["count"]
        return ModuleSummary(total=total, details=status_breakdown if status_breakdown else None)

    # Vehicle counts with status breakdown
    async def get_vehicle_stats():
        total = await db.vehicles.count_documents({})
        # Get status breakdown
        pipeline = [
            {"$group": {"_id": "$status", "count": {"$sum": 1}}}
        ]
        status_breakdown = {}
        async for doc in db.vehicles.aggregate(pipeline):
            if doc["_id"]:
                status_breakdown[doc["_id"]] = doc["count"]
        available = status_breakdown.get("available", 0)
        return ModuleSummary(total=total, active=available, details=status_breakdown if status_breakdown else None)

    # Shipment counts with status breakdown
    async def get_shipment_stats():
        total = await db.shipments.count_documents({})
        # Get status breakdown
        pipeline = [
            {"$group": {"_id": "$status", "count": {"$sum": 1}}}
        ]
        status_breakdown = {}
        async for doc in db.shipments.aggregate(pipeline):
            if doc["_id"]:
                status_breakdown[doc["_id"]] = doc["count"]
        return ModuleSummary(total=total, details=status_breakdown if status_breakdown else None)

    # Campaign counts
    async def get_campaign_stats():
        total = await db.campaigns.count_documents({})
        active = await db.campaigns.count_documents({"status": "active"})
        return ModuleSummary(total=total, active=active)

    # User counts
    async def get_user_stats():
        total = await db.users.count_documents({})
        active = await db.users.count_documents({"isActive": True})
        return ModuleSummary(total=total, active=active)

    # Execute all queries concurrently
    (
        farms,
        blocks,
        employees,
        customers,
        orders,
        vehicles,
        shipments,
        campaigns,
        users,
    ) = await asyncio.gather(
        get_farm_stats(),
        get_block_stats(),
        get_employee_stats(),
        get_customer_stats(),
        get_order_stats(),
        get_vehicle_stats(),
        get_shipment_stats(),
        get_campaign_stats(),
        get_user_stats(),
    )

    return DashboardSummaryResponse(
        farms=farms,
        blocks=blocks,
        employees=employees,
        customers=customers,
        orders=orders,
        vehicles=vehicles,
        shipments=shipments,
        campaigns=campaigns,
        users=users,
        lastUpdated=datetime.utcnow(),
    )


@router.get(
    "/widgets/{widget_id}/data",
    response_model=WidgetDataResponse,
    summary="Get widget data",
    description="Fetch data for a specific dashboard widget by ID",
)
async def get_widget_data(
    widget_id: str,
    current_user: UserResponse = Depends(get_current_active_user),
) -> WidgetDataResponse:
    """
    Get data for a specific widget.

    **Authentication:** Required (JWT token)

    **Permission:** Authenticated users only

    **Args:**
        - widget_id: Unique widget identifier

    **Returns:**
        - widgetId: Widget identifier
        - data: Widget data (chart or stat)
        - lastUpdated: Timestamp of last update

    **Example Response:**
    ```json
    {
      "widgetId": "sales-trend-chart",
      "data": {
        "chartType": "line",
        "data": [
          {"date": "Mon", "sales": 4200, "revenue": 12500},
          {"date": "Tue", "sales": 5100, "revenue": 15300}
        ],
        "xKey": "date",
        "yKey": "sales",
        "series": [
          {"name": "Sales", "dataKey": "sales", "color": "#3b82f6"},
          {"name": "Revenue", "dataKey": "revenue", "color": "#10b981"}
        ]
      },
      "lastUpdated": "2025-10-27T12:00:00.000000"
    }
    ```

    **Error Responses:**
        - 401: Unauthorized (missing or invalid token)
        - 404: Widget not found
        - 500: Internal server error
    """
    try:
        widget_data = await DashboardService.get_widget_data(
            widget_id=widget_id, user_id=current_user.userId
        )
        return widget_data
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Widget not found: {str(e)}",
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch widget data: {str(e)}",
        )


@router.post(
    "/widgets/{widget_id}/refresh",
    response_model=WidgetDataResponse,
    summary="Refresh widget data",
    description="Force refresh data for a specific dashboard widget",
)
async def refresh_widget_data(
    widget_id: str,
    current_user: UserResponse = Depends(get_current_active_user),
) -> WidgetDataResponse:
    """
    Refresh data for a specific widget.

    This endpoint forces a fresh fetch of widget data, bypassing any caches.

    **Authentication:** Required (JWT token)

    **Permission:** Authenticated users only

    **Args:**
        - widget_id: Unique widget identifier

    **Returns:**
        - widgetId: Widget identifier
        - data: Refreshed widget data
        - lastUpdated: Timestamp of last update (current time)

    **Example Response:**
    Same format as GET /widgets/{widget_id}/data

    **Error Responses:**
        - 401: Unauthorized (missing or invalid token)
        - 404: Widget not found
        - 500: Internal server error
    """
    try:
        widget_data = await DashboardService.refresh_widget_data(
            widget_id=widget_id, user_id=current_user.userId
        )
        return widget_data
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Widget not found: {str(e)}",
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to refresh widget data: {str(e)}",
        )


@router.post(
    "/widgets/bulk",
    response_model=BulkWidgetDataResponse,
    summary="Get bulk widget data",
    description="Fetch data for multiple dashboard widgets in a single request",
)
async def get_bulk_widget_data(
    request: BulkWidgetDataRequest,
    current_user: UserResponse = Depends(get_current_active_user),
) -> BulkWidgetDataResponse:
    """
    Get data for multiple widgets in a single request.

    This is more efficient than making multiple individual requests
    when loading a dashboard with many widgets.

    **Authentication:** Required (JWT token)

    **Permission:** Authenticated users only

    **Request Body:**
    ```json
    {
      "widgetIds": ["total-users", "sales-trend-chart", "revenue-breakdown-chart"]
    }
    ```

    **Limits:**
        - Minimum: 1 widget ID
        - Maximum: 50 widget IDs per request

    **Returns:**
        - widgets: Array of successful widget data responses
        - requestedCount: Number of widgets requested
        - returnedCount: Number of widgets successfully returned
        - errors: Array of errors for failed widgets (if any)

    **Example Response:**
    ```json
    {
      "widgets": [
        {
          "widgetId": "total-users",
          "data": {"value": "15,234", "label": "Total Users", "trend": 12.5},
          "lastUpdated": "2025-10-27T12:00:00"
        },
        {
          "widgetId": "sales-trend-chart",
          "data": {
            "chartType": "line",
            "data": [...],
            "xKey": "date",
            "yKey": "sales"
          },
          "lastUpdated": "2025-10-27T12:00:00"
        }
      ],
      "requestedCount": 3,
      "returnedCount": 2,
      "errors": [
        {"widgetId": "invalid-widget", "error": "Unknown widget_id: invalid-widget"}
      ]
    }
    ```

    **Notes:**
        - Partial failures are supported: successful widgets are returned even if some fail
        - Check the `errors` array for failed widgets
        - `returnedCount` may be less than `requestedCount` if some widgets fail

    **Error Responses:**
        - 400: Invalid request (empty widget list, too many widgets)
        - 401: Unauthorized (missing or invalid token)
        - 500: Internal server error
    """
    try:
        result = await DashboardService.get_bulk_widget_data(
            widget_ids=request.widgetIds, user_id=current_user.userId
        )

        return BulkWidgetDataResponse(
            widgets=result["widgets"],
            requestedCount=result["requestedCount"],
            returnedCount=result["returnedCount"],
            errors=result.get("errors"),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch bulk widget data: {str(e)}",
        )


@router.get(
    "/health",
    summary="Dashboard API health check",
    description="Check if dashboard API is operational",
)
async def dashboard_health():
    """
    Dashboard API health check.

    Returns simple health status for dashboard endpoints.

    **Authentication:** Not required

    **Returns:**
    ```json
    {
      "status": "healthy",
      "service": "Dashboard API",
      "endpoints": 3
    }
    ```
    """
    return {
        "status": "healthy",
        "service": "Dashboard API",
        "endpoints": 3,
    }
