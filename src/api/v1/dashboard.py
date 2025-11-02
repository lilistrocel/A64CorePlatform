"""
Dashboard API Endpoints

API routes for CCM Dashboard widget data management.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from typing import List

from ...models.dashboard import (
    BulkWidgetDataRequest,
    BulkWidgetDataResponse,
    WidgetDataResponse,
)
from ...models.user import UserResponse
from ...middleware.auth import get_current_active_user
from ...services.dashboard_service import DashboardService

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


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
