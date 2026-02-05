"""
Dashboard Service

Service layer for CCM Dashboard widget data management.
Handles data fetching from various sources (modules, system metrics, external APIs).
"""

import random
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Union

from ..models.dashboard import (
    ChartSeries,
    ChartWidgetData,
    StatWidgetData,
    WidgetDataResponse,
)


class DashboardService:
    """Service for managing dashboard widget data."""

    # Known widget IDs (for mock data generation)
    WIDGET_IDS = {
        "total-users",
        "active-sessions",
        "api-requests",
        "sales-trend-chart",
        "revenue-breakdown-chart",
        "user-activity-chart",
    }

    @staticmethod
    def generate_sales_trend_data() -> ChartWidgetData:
        """
        Generate mock sales trend data (line chart).

        Returns:
            ChartWidgetData: Line chart with 7 days of sales and revenue data
        """
        days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        base_sales = 4000
        base_revenue = 12000

        data = []
        for i, day in enumerate(days):
            # Add some variance
            variance = random.uniform(0.8, 1.3)
            sales = int(base_sales * variance) + (i * 200)
            revenue = int(base_revenue * variance) + (i * 500)

            data.append({"date": day, "sales": sales, "revenue": revenue})

        return ChartWidgetData(
            chartType="line",
            data=data,
            xKey="date",
            yKey="sales",
            series=[
                ChartSeries(name="Sales", dataKey="sales", color="#3b82f6"),
                ChartSeries(name="Revenue", dataKey="revenue", color="#10b981"),
            ],
        )

    @staticmethod
    def generate_revenue_breakdown_data() -> ChartWidgetData:
        """
        Generate mock revenue breakdown data (pie chart).

        Returns:
            ChartWidgetData: Pie chart with revenue by category
        """
        categories = [
            {"category": "Electronics", "amount": 45000},
            {"category": "Clothing", "amount": 32000},
            {"category": "Food & Beverage", "amount": 28000},
            {"category": "Home & Garden", "amount": 22000},
            {"category": "Sports", "amount": 18000},
        ]

        # Add some random variance
        for cat in categories:
            cat["amount"] = int(cat["amount"] * random.uniform(0.9, 1.1))

        return ChartWidgetData(
            chartType="pie",
            data=categories,
            xKey="category",
            yKey="amount",
        )

    @staticmethod
    def generate_user_activity_data() -> ChartWidgetData:
        """
        Generate mock user activity data (bar chart).

        Returns:
            ChartWidgetData: Bar chart with 7 days of user activity
        """
        days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        base_active = 2500
        base_new = 450

        data = []
        for i, day in enumerate(days):
            # Weekends have less activity
            multiplier = 0.7 if day in ["Sat", "Sun"] else 1.0
            variance = random.uniform(0.85, 1.15)

            active = int(base_active * multiplier * variance) + (i * 50)
            new = int(base_new * multiplier * variance) + (i * 10)

            data.append({"day": day, "activeUsers": active, "newUsers": new})

        return ChartWidgetData(
            chartType="bar",
            data=data,
            xKey="day",
            yKey="activeUsers",
            series=[
                ChartSeries(name="Active Users", dataKey="activeUsers", color="#3b82f6"),
                ChartSeries(name="New Users", dataKey="newUsers", color="#10b981"),
            ],
        )

    @staticmethod
    def generate_total_users_stat() -> StatWidgetData:
        """
        Generate mock total users stat data.

        Returns:
            StatWidgetData: Total users with trend
        """
        total = random.randint(15000, 18000)
        trend = round(random.uniform(5.0, 15.0), 1)

        return StatWidgetData(
            value=f"{total:,}",
            label="Total Users",
            trend=trend,
            trendLabel="vs last month",
        )

    @staticmethod
    def generate_active_sessions_stat() -> StatWidgetData:
        """
        Generate mock active sessions stat data.

        Returns:
            StatWidgetData: Active sessions with trend
        """
        sessions = random.randint(2000, 3500)
        trend = round(random.uniform(-5.0, 10.0), 1)

        return StatWidgetData(
            value=f"{sessions:,}",
            label="Active Sessions",
            trend=trend,
            trendLabel="vs yesterday",
        )

    @staticmethod
    def generate_api_requests_stat() -> StatWidgetData:
        """
        Generate mock API requests stat data.

        Returns:
            StatWidgetData: API requests with trend
        """
        requests = random.randint(250000, 500000)
        trend = round(random.uniform(10.0, 25.0), 1)

        return StatWidgetData(
            value=f"{requests:,}",
            label="API Requests (24h)",
            trend=trend,
            trendLabel="vs last 24h",
        )

    @classmethod
    async def get_widget_data(
        cls, widget_id: str, user_id: Optional[str] = None
    ) -> WidgetDataResponse:
        """
        Get data for a specific widget.

        Args:
            widget_id: Unique widget identifier
            user_id: Optional user ID for personalized data

        Returns:
            WidgetDataResponse: Widget data with metadata

        Raises:
            ValueError: If widget_id is not recognized
        """
        # Map widget IDs to data generators
        data_generators = {
            "sales-trend-chart": cls.generate_sales_trend_data,
            "revenue-breakdown-chart": cls.generate_revenue_breakdown_data,
            "user-activity-chart": cls.generate_user_activity_data,
            "total-users": cls.generate_total_users_stat,
            "active-sessions": cls.generate_active_sessions_stat,
            "api-requests": cls.generate_api_requests_stat,
        }

        if widget_id not in data_generators:
            raise ValueError(f"Unknown widget_id: {widget_id}")

        # Generate data
        data = data_generators[widget_id]()

        return WidgetDataResponse(
            widgetId=widget_id,
            data=data,
            lastUpdated=datetime.utcnow(),
        )

    @classmethod
    async def refresh_widget_data(
        cls, widget_id: str, user_id: Optional[str] = None
    ) -> WidgetDataResponse:
        """
        Refresh data for a specific widget.

        This method is identical to get_widget_data but can be extended
        in the future to include cache invalidation or force-refresh logic.

        Args:
            widget_id: Unique widget identifier
            user_id: Optional user ID for personalized data

        Returns:
            WidgetDataResponse: Refreshed widget data with metadata

        Raises:
            ValueError: If widget_id is not recognized
        """
        # For now, simply call get_widget_data (no caching implemented yet)
        return await cls.get_widget_data(widget_id, user_id)

    @classmethod
    async def get_bulk_widget_data(
        cls, widget_ids: List[str], user_id: Optional[str] = None
    ) -> Dict[str, Union[List[WidgetDataResponse], List[Dict[str, str]], int]]:
        """
        Get data for multiple widgets in a single request.

        Args:
            widget_ids: List of widget identifiers
            user_id: Optional user ID for personalized data

        Returns:
            Dict containing:
                - widgets: List of successful widget data responses
                - errors: List of errors for failed widgets
                - requestedCount: Number of widgets requested
                - returnedCount: Number of widgets successfully returned
        """
        widgets = []
        errors = []

        for widget_id in widget_ids:
            try:
                widget_data = await cls.get_widget_data(widget_id, user_id)
                widgets.append(widget_data)
            except ValueError as e:
                errors.append({"widgetId": widget_id, "error": str(e)})
            except Exception as e:
                errors.append(
                    {"widgetId": widget_id, "error": f"Unexpected error: {str(e)}"}
                )

        return {
            "widgets": widgets,
            "requestedCount": len(widget_ids),
            "returnedCount": len(widgets),
            "errors": errors if errors else None,
        }

    @classmethod
    async def get_system_metric(cls, metric_name: str) -> Dict[str, any]:
        """
        Get system metric data (for system data source widgets).

        Args:
            metric_name: Name of the system metric

        Returns:
            Dict: Metric data

        Future Implementation:
            - CPU usage
            - Memory usage
            - Disk usage
            - Network traffic
            - Database connections
            - API response times
        """
        # Placeholder for system metrics
        # TODO: Implement actual system metric collection
        raise NotImplementedError("System metrics not yet implemented")

    @classmethod
    async def get_module_data(
        cls, module_name: str, endpoint: str, params: Optional[Dict] = None
    ) -> Dict[str, any]:
        """
        Get data from an installed module.

        Args:
            module_name: Name of the installed module
            endpoint: API endpoint path
            params: Optional query parameters

        Returns:
            Dict: Module data

        Future Implementation:
            - Fetch data from installed module API
            - Handle module authentication
            - Transform module data to widget format
        """
        # Placeholder for module data fetching
        # TODO: Implement module data fetching via HTTP
        raise NotImplementedError("Module data fetching not yet implemented")

    @classmethod
    async def get_external_api_data(
        cls, api_name: str, endpoint: str, credentials: Optional[str] = None, params: Optional[Dict] = None
    ) -> Dict[str, any]:
        """
        Get data from an external API.

        Args:
            api_name: Name of the external API
            endpoint: API endpoint
            credentials: Optional credentials identifier
            params: Optional query parameters

        Returns:
            Dict: External API data

        Future Implementation:
            - Fetch data from external APIs
            - Handle authentication (API keys, OAuth)
            - Transform external data to widget format
            - Implement rate limiting
            - Cache external API responses
        """
        # External data fetching - not yet implemented
        # Will be added when external integrations are configured
        raise NotImplementedError("External data fetching not yet implemented")
