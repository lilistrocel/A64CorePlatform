"""
Farm Management Module - Weather API Routes

Endpoints for agricultural weather data from WeatherBit.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from uuid import UUID
import logging

from ...models.weather import (
    CurrentWeather,
    AgriWeatherForecast,
    AgriWeatherData,
)
from ...services.weather import WeatherService
from ...services.farm import FarmService
from ...middleware.auth import get_current_active_user, CurrentUser
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
    description="Get comprehensive agricultural weather data with insights and recommendations."
)
async def get_agri_data(
    farm_id: UUID,
    current_user: CurrentUser = Depends(get_current_active_user),
    weather_service: WeatherService = Depends(),
    farm_service: FarmService = Depends()
):
    """
    Get complete agricultural weather data for a farm

    Returns comprehensive weather data including current conditions,
    forecast, soil data, and AI-generated agricultural insights.

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

    agri_data = await weather_service.get_agri_data(farm_id)

    return SuccessResponse(
        data=agri_data,
        message="Agricultural weather data retrieved successfully"
    )
