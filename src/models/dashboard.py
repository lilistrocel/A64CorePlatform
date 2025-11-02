"""
Dashboard and Widget Data Models

Pydantic models for CCM Dashboard widgets and chart data.
"""

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional, Union
from pydantic import BaseModel, Field


# ============================================================================
# Chart Data Models
# ============================================================================


class ChartSeries(BaseModel):
    """Chart series configuration for multi-series charts."""

    name: str = Field(..., description="Display name of the series")
    dataKey: str = Field(..., description="Key in data array to plot")
    color: str = Field(..., description="Color hex code (e.g., #3b82f6)")


class ChartWidgetData(BaseModel):
    """Chart widget data structure."""

    chartType: Literal["line", "bar", "pie"] = Field(..., description="Type of chart")
    data: List[Dict[str, Any]] = Field(..., description="Array of data points")
    xKey: str = Field(..., description="Key for x-axis values")
    yKey: str = Field(..., description="Key for y-axis values (primary series)")
    series: Optional[List[ChartSeries]] = Field(None, description="Multiple data series configuration")


class StatWidgetData(BaseModel):
    """Stat widget data structure."""

    value: Union[str, int, float] = Field(..., description="Main metric value")
    label: str = Field(..., description="Label for the metric")
    trend: Optional[float] = Field(None, description="Trend percentage (e.g., 12.5 for +12.5%)")
    trendLabel: Optional[str] = Field(None, description="Trend description (e.g., 'vs last week')")


# ============================================================================
# Widget Data Source Models
# ============================================================================


class ModuleDataSource(BaseModel):
    """Data source from an installed module."""

    type: Literal["module"] = "module"
    moduleName: str = Field(..., description="Name of the installed module")
    endpoint: str = Field(..., description="API endpoint path")
    params: Optional[Dict[str, Any]] = Field(None, description="Query parameters")


class SystemDataSource(BaseModel):
    """Data source from system metrics."""

    type: Literal["system"] = "system"
    metric: str = Field(..., description="System metric name")
    params: Optional[Dict[str, Any]] = Field(None, description="Query parameters")


class ExternalAPIDataSource(BaseModel):
    """Data source from external API."""

    type: Literal["external_api"] = "external_api"
    apiName: str = Field(..., description="Name of the external API")
    endpoint: str = Field(..., description="API endpoint")
    credentials: Optional[str] = Field(None, description="Credentials identifier")
    params: Optional[Dict[str, Any]] = Field(None, description="Query parameters")


WidgetDataSource = Union[ModuleDataSource, SystemDataSource, ExternalAPIDataSource]


# ============================================================================
# Widget Configuration Models
# ============================================================================


class CCMWidget(BaseModel):
    """CCM Dashboard widget configuration."""

    id: str = Field(..., description="Unique widget identifier")
    title: str = Field(..., description="Widget title")
    description: Optional[str] = Field(None, description="Widget description")
    icon: Optional[str] = Field(None, description="Widget icon (emoji or icon name)")
    dataSource: WidgetDataSource = Field(..., description="Data source configuration")
    refreshInterval: Optional[int] = Field(None, description="Auto-refresh interval in seconds")
    type: Literal["stat", "chart", "table", "gauge", "list", "custom"] = Field(..., description="Widget type")
    size: Literal["small", "medium", "large", "wide", "full-width"] = Field(..., description="Widget size")
    permissions: Optional[List[str]] = Field(None, description="Required permissions")
    roles: Optional[List[str]] = Field(None, description="Required roles")


# ============================================================================
# API Response Models
# ============================================================================


class WidgetDataResponse(BaseModel):
    """Response for widget data request."""

    widgetId: str = Field(..., description="Widget identifier")
    data: Union[ChartWidgetData, StatWidgetData, Dict[str, Any]] = Field(..., description="Widget data")
    lastUpdated: datetime = Field(default_factory=datetime.utcnow, description="Last update timestamp")


class BulkWidgetDataRequest(BaseModel):
    """Request for bulk widget data."""

    widgetIds: List[str] = Field(..., description="List of widget IDs to fetch", min_length=1, max_length=50)


class BulkWidgetDataResponse(BaseModel):
    """Response for bulk widget data request."""

    widgets: List[WidgetDataResponse] = Field(..., description="Array of widget data")
    requestedCount: int = Field(..., description="Number of widgets requested")
    returnedCount: int = Field(..., description="Number of widgets returned")
    errors: Optional[List[Dict[str, str]]] = Field(None, description="Errors for failed widgets")


# ============================================================================
# Dashboard Configuration Models
# ============================================================================


class DashboardLayout(BaseModel):
    """Dashboard layout configuration (for future use)."""

    i: str = Field(..., description="Widget ID (matches CCMWidget.id)")
    x: int = Field(..., ge=0, description="X position in grid")
    y: int = Field(..., ge=0, description="Y position in grid")
    w: int = Field(..., ge=1, description="Width in grid units")
    h: int = Field(..., ge=1, description="Height in grid units")
    minW: int = Field(default=1, ge=1, description="Minimum width")
    minH: int = Field(default=1, ge=1, description="Minimum height")


class DashboardConfig(BaseModel):
    """Dashboard configuration (for future use)."""

    userId: str = Field(..., description="User ID who owns this dashboard")
    widgets: List[CCMWidget] = Field(..., description="List of widgets")
    layout: Optional[List[DashboardLayout]] = Field(None, description="Widget layout configuration")
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)
