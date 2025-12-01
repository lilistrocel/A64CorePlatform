"""
Farm Management Module - Weather API Routes

Endpoints for agricultural weather data from WeatherBit.
Supports server-side caching with hourly background refresh.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from uuid import UUID
import logging
from typing import Optional

from ...models.weather import (
    CurrentWeather,
    AgriWeatherForecast,
    AgriWeatherData,
)
from ...services.weather import WeatherService
from ...services.weather.weather_cache_service import get_weather_cache_service
from ...services.farm import FarmService
from ...middleware.auth import get_current_active_user, require_permission, CurrentUser
from ...utils.responses import SuccessResponse

logger = logging.getLogger(__name__)

router = APIRouter()


async def verify_farm_access(
    farm_id: UUID,
    current_user: CurrentUser,
    farm_service: FarmService
) -> None:
    """
    Verify user has access to the farm

    Raises:
        HTTPException if user doesn't have access
    """
    farm = await farm_service.get_farm(farm_id)

    # Admins can access all farms
    if current_user.role in ["super_admin", "admin"]:
        return

    # Farm managers can access their own farms
    if str(farm.managerId) == current_user.userId:
        return

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="You don't have access to this farm's weather data"
    )


@router.get(
    "/farms/{farm_id}/weather/current",
    response_model=SuccessResponse[CurrentWeather],
    summary="Get current weather",
    description="Get current weather conditions for a farm based on its location coordinates."
)
async def get_current_weather(
    farm_id: UUID,
    current_user: CurrentUser = Depends(get_current_active_user),
    weather_service: WeatherService = Depends(),
    farm_service: FarmService = Depends()
):
    """
    Get current weather for a farm

    Returns current temperature, humidity, wind, precipitation,
    and other weather conditions based on the farm's GPS coordinates.

    **Requirements:**
    - Farm must have latitude and longitude configured
    - User must have access to the farm (manager or admin)

    **Returns:**
    - Current temperature and feels-like temperature
    - Weather description and icon
    - Humidity, pressure, visibility
    - Wind speed and direction
    - UV index and solar radiation
    - Air quality index (if available)
    """
    await verify_farm_access(farm_id, current_user, farm_service)

    weather = await weather_service.get_current_weather(farm_id)

    return SuccessResponse(
        data=weather,
        message="Current weather retrieved successfully"
    )


@router.get(
    "/farms/{farm_id}/weather/forecast",
    response_model=SuccessResponse[AgriWeatherForecast],
    summary="Get agricultural weather forecast",
    description="Get 8-day agricultural weather forecast with soil conditions."
)
async def get_weather_forecast(
    farm_id: UUID,
    current_user: CurrentUser = Depends(get_current_active_user),
    weather_service: WeatherService = Depends(),
    farm_service: FarmService = Depends()
):
    """
    Get agricultural weather forecast for a farm

    Returns 8-day forecast with agricultural-specific data including
    soil temperature, soil moisture, and evapotranspiration.

    **Requirements:**
    - Farm must have latitude and longitude configured
    - User must have access to the farm (manager or admin)
    - Full soil data requires WeatherBit Business/Enterprise plan

    **Returns for each day:**
    - High/low/average temperatures
    - Precipitation amount and probability
    - Humidity and wind speed
    - Evapotranspiration (ET0)
    - Soil temperature at multiple depths (0-10cm, 10-40cm, 40-100cm, 100-200cm)
    - Soil moisture at multiple depths
    - Solar radiation data
    """
    await verify_farm_access(farm_id, current_user, farm_service)

    forecast = await weather_service.get_agri_forecast(farm_id)

    return SuccessResponse(
        data=forecast,
        message="Weather forecast retrieved successfully"
    )


@router.get(
    "/farms/{farm_id}/weather/agri-data",
    response_model=SuccessResponse[AgriWeatherData],
    summary="Get complete agricultural weather data",
    description="Get comprehensive agricultural weather data with insights and recommendations. Uses server-side cache with hourly updates."
)
async def get_agri_data(
    farm_id: UUID,
    refresh: bool = Query(False, description="Force refresh from API (bypass cache)"),
    current_user: CurrentUser = Depends(get_current_active_user),
    weather_service: WeatherService = Depends(),
    farm_service: FarmService = Depends()
):
    """
    Get complete agricultural weather data for a farm

    Returns comprehensive weather data including current conditions,
    forecast, soil data, and AI-generated agricultural insights.

    **Caching:**
    - Data is cached server-side and refreshed hourly in the background
    - Use `refresh=true` to force fresh data from the API

    **Requirements:**
    - Farm must have latitude and longitude configured
    - User must have access to the farm (manager or admin)

    **Returns:**
    - Current weather conditions
    - Current soil temperature and moisture
    - 8-day agricultural forecast
    - Agricultural insights including:
      - Growing conditions assessment
      - Risk levels (frost, drought, flood, heat stress)
      - Soil workability assessment
      - Irrigation recommendations
      - Weather-based alerts and recommendations
    """
    await verify_farm_access(farm_id, current_user, farm_service)

    # Try to get cached data first (unless refresh is requested)
    if not refresh:
        try:
            cache_service = get_weather_cache_service()
            cached_data = await cache_service.get_cached_weather(farm_id)

            if cached_data:
                logger.debug(f"Returning cached weather data for farm {farm_id}")
                return SuccessResponse(
                    data=cached_data,
                    message="Agricultural weather data retrieved from cache"
                )
        except Exception as e:
            logger.warning(f"Error accessing weather cache for farm {farm_id}: {e}")
            # Fall through to fetch fresh data

    # Fetch fresh data from API
    agri_data = await weather_service.get_agri_data(farm_id)

    # Store in cache (async, don't wait)
    try:
        cache_service = get_weather_cache_service()
        await cache_service.set_cached_weather(farm_id, agri_data)
    except Exception as e:
        logger.warning(f"Error caching weather data for farm {farm_id}: {e}")

    return SuccessResponse(
        data=agri_data,
        message="Agricultural weather data retrieved successfully"
    )


# =============================================================================
# ADMIN CACHE MANAGEMENT ENDPOINTS
# =============================================================================

@router.get(
    "/weather/cache/stats",
    response_model=SuccessResponse[dict],
    summary="Get weather cache statistics",
    description="Get statistics about the weather cache. Admin only."
)
async def get_cache_stats(
    current_user: CurrentUser = Depends(require_permission("admin.manage"))
):
    """
    Get weather cache statistics

    **Admin only** - Requires admin.manage permission

    Returns:
    - Total cached entries
    - Fresh vs stale entries
    - Oldest and newest updates
    - Background refresh status
    """
    try:
        cache_service = get_weather_cache_service()
        stats = await cache_service.get_cache_stats()

        return SuccessResponse(
            data=stats,
            message="Cache statistics retrieved successfully"
        )
    except Exception as e:
        logger.error(f"Error getting cache stats: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get cache statistics: {str(e)}"
        )


@router.post(
    "/weather/cache/refresh",
    response_model=SuccessResponse[dict],
    summary="Trigger manual cache refresh",
    description="Manually trigger a refresh of all cached weather data. Admin only."
)
async def trigger_cache_refresh(
    current_user: CurrentUser = Depends(require_permission("admin.manage"))
):
    """
    Trigger manual cache refresh for all farms

    **Admin only** - Requires admin.manage permission

    This will fetch fresh weather data from the API for all farms
    that have location coordinates configured.

    Returns:
    - Total farms processed
    - Success/failure count
    - List of farm results
    """
    try:
        cache_service = get_weather_cache_service()
        result = await cache_service.refresh_all_farms()

        return SuccessResponse(
            data=result,
            message=f"Cache refresh completed: {result['success']}/{result['total']} farms updated"
        )
    except Exception as e:
        logger.error(f"Error triggering cache refresh: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to refresh cache: {str(e)}"
        )


@router.delete(
    "/weather/cache/{farm_id}",
    response_model=SuccessResponse[dict],
    summary="Invalidate cache for a farm",
    description="Invalidate cached weather data for a specific farm. Admin only."
)
async def invalidate_farm_cache(
    farm_id: UUID,
    current_user: CurrentUser = Depends(require_permission("admin.manage"))
):
    """
    Invalidate cached weather data for a specific farm

    **Admin only** - Requires admin.manage permission

    The next request for this farm's weather data will fetch fresh data from the API.
    """
    try:
        cache_service = get_weather_cache_service()
        success = await cache_service.invalidate_cache(farm_id)

        return SuccessResponse(
            data={"farmId": str(farm_id), "invalidated": success},
            message=f"Cache {'invalidated' if success else 'not found'} for farm {farm_id}"
        )
    except Exception as e:
        logger.error(f"Error invalidating cache for farm {farm_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to invalidate cache: {str(e)}"
        )
