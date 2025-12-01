"""
WeatherBit API Client

HTTP client for WeatherBit API with error handling and response parsing.
"""

import httpx
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any

from ...config.settings import settings

logger = logging.getLogger(__name__)


class WeatherAPIError(Exception):
    """Custom exception for weather API errors"""

    def __init__(self, message: str, status_code: Optional[int] = None):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)


class WeatherAPIClient:
    """HTTP client for WeatherBit API"""

    def __init__(self):
        self.base_url = settings.WEATHERBIT_API_URL
        self.api_key = settings.WEATHERBIT_API_KEY
        self.enabled = settings.WEATHERBIT_ENABLED
        self.timeout = 30.0  # 30 second timeout

    def _check_enabled(self) -> None:
        """Check if WeatherBit integration is enabled"""
        if not self.enabled:
            raise WeatherAPIError("WeatherBit integration is disabled")
        if not self.api_key:
            raise WeatherAPIError("WeatherBit API key not configured")

    async def get_current_weather(
        self,
        latitude: float,
        longitude: float,
        units: str = "M"  # M=Metric, S=Scientific, I=Imperial
    ) -> Dict[str, Any]:
        """
        Get current weather conditions

        Args:
            latitude: Location latitude
            longitude: Location longitude
            units: Unit system (M=Metric default)

        Returns:
            Current weather data from API
        """
        self._check_enabled()

        params = {
            "lat": latitude,
            "lon": longitude,
            "key": self.api_key,
            "units": units,
            "include": "alerts"
        }

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                response = await client.get(
                    f"{self.base_url}/current",
                    params=params
                )
                response.raise_for_status()
                data = response.json()

                if "data" not in data or not data["data"]:
                    raise WeatherAPIError("No weather data returned from API")

                # Debug log to see what fields are returned
                logger.info(f"Current Weather API response fields: {list(data['data'][0].keys())}")

                return data["data"][0]  # Return first result

            except httpx.HTTPStatusError as e:
                logger.error(f"WeatherBit API HTTP error: {e.response.status_code}")
                raise WeatherAPIError(
                    f"Weather API returned error: {e.response.status_code}",
                    status_code=e.response.status_code
                )
            except httpx.RequestError as e:
                logger.error(f"WeatherBit API request error: {e}")
                raise WeatherAPIError(f"Failed to connect to weather API: {str(e)}")

    async def get_agweather_forecast(
        self,
        latitude: float,
        longitude: float,
        units: str = "M"
    ) -> Dict[str, Any]:
        """
        Get agricultural weather forecast (8 days)

        Args:
            latitude: Location latitude
            longitude: Location longitude
            units: Unit system

        Returns:
            Agricultural forecast data from API
        """
        self._check_enabled()

        params = {
            "lat": latitude,
            "lon": longitude,
            "key": self.api_key,
            "units": units
        }

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                response = await client.get(
                    f"{self.base_url}/forecast/agweather",
                    params=params
                )
                response.raise_for_status()
                data = response.json()

                # Debug log to see what fields are returned
                if data.get("data") and len(data["data"]) > 0:
                    logger.info(f"AgWeather API response fields: {list(data['data'][0].keys())}")

                return data

            except httpx.HTTPStatusError as e:
                logger.error(f"WeatherBit AgWeather API HTTP error: {e.response.status_code}")
                # AgWeather endpoint requires Business/Enterprise plan
                if e.response.status_code == 403:
                    raise WeatherAPIError(
                        "AgWeather API requires Business or Enterprise plan",
                        status_code=403
                    )
                raise WeatherAPIError(
                    f"Weather API returned error: {e.response.status_code}",
                    status_code=e.response.status_code
                )
            except httpx.RequestError as e:
                logger.error(f"WeatherBit API request error: {e}")
                raise WeatherAPIError(f"Failed to connect to weather API: {str(e)}")

    async def get_agweather_history(
        self,
        latitude: float,
        longitude: float,
        start_date: datetime,
        end_date: datetime,
        units: str = "M"
    ) -> Dict[str, Any]:
        """
        Get historical agricultural weather data

        Args:
            latitude: Location latitude
            longitude: Location longitude
            start_date: Start date for historical data
            end_date: End date for historical data
            units: Unit system

        Returns:
            Historical agricultural weather data
        """
        self._check_enabled()

        params = {
            "lat": latitude,
            "lon": longitude,
            "key": self.api_key,
            "units": units,
            "start_date": start_date.strftime("%Y-%m-%d"),
            "end_date": end_date.strftime("%Y-%m-%d")
        }

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                response = await client.get(
                    f"{self.base_url}/history/agweather",
                    params=params
                )
                response.raise_for_status()
                data = response.json()

                return data

            except httpx.HTTPStatusError as e:
                logger.error(f"WeatherBit History API HTTP error: {e.response.status_code}")
                if e.response.status_code == 403:
                    raise WeatherAPIError(
                        "Historical AgWeather API requires Business or Enterprise plan",
                        status_code=403
                    )
                raise WeatherAPIError(
                    f"Weather API returned error: {e.response.status_code}",
                    status_code=e.response.status_code
                )
            except httpx.RequestError as e:
                logger.error(f"WeatherBit API request error: {e}")
                raise WeatherAPIError(f"Failed to connect to weather API: {str(e)}")

    async def get_weather_forecast(
        self,
        latitude: float,
        longitude: float,
        days: int = 7,
        units: str = "M"
    ) -> Dict[str, Any]:
        """
        Get standard weather forecast (fallback if agweather not available)

        Args:
            latitude: Location latitude
            longitude: Location longitude
            days: Number of forecast days (max 16)
            units: Unit system

        Returns:
            Weather forecast data
        """
        self._check_enabled()

        params = {
            "lat": latitude,
            "lon": longitude,
            "key": self.api_key,
            "units": units,
            "days": min(days, 16)
        }

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                response = await client.get(
                    f"{self.base_url}/forecast/daily",
                    params=params
                )
                response.raise_for_status()
                data = response.json()

                # Debug log to see what fields are returned
                if data.get("data") and len(data["data"]) > 0:
                    logger.info(f"Standard Forecast API response fields: {list(data['data'][0].keys())}")

                return data

            except httpx.HTTPStatusError as e:
                logger.error(f"WeatherBit Forecast API HTTP error: {e.response.status_code}")
                raise WeatherAPIError(
                    f"Weather API returned error: {e.response.status_code}",
                    status_code=e.response.status_code
                )
            except httpx.RequestError as e:
                logger.error(f"WeatherBit API request error: {e}")
                raise WeatherAPIError(f"Failed to connect to weather API: {str(e)}")

    async def get_air_quality(
        self,
        latitude: float,
        longitude: float
    ) -> Dict[str, Any]:
        """
        Get current air quality data

        Args:
            latitude: Location latitude
            longitude: Location longitude

        Returns:
            Air quality data from API including AQI, PM2.5, PM10, etc.
        """
        self._check_enabled()

        params = {
            "lat": latitude,
            "lon": longitude,
            "key": self.api_key
        }

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                response = await client.get(
                    f"{self.base_url}/current/airquality",
                    params=params
                )
                response.raise_for_status()
                data = response.json()

                if "data" not in data or not data["data"]:
                    raise WeatherAPIError("No air quality data returned from API")

                # Debug log to see what fields are returned
                logger.info(f"Air Quality API response fields: {list(data['data'][0].keys())}")

                return data["data"][0]  # Return first result

            except httpx.HTTPStatusError as e:
                logger.error(f"WeatherBit Air Quality API HTTP error: {e.response.status_code}")
                if e.response.status_code == 403:
                    raise WeatherAPIError(
                        "Air Quality API requires a paid plan",
                        status_code=403
                    )
                raise WeatherAPIError(
                    f"Air Quality API returned error: {e.response.status_code}",
                    status_code=e.response.status_code
                )
            except httpx.RequestError as e:
                logger.error(f"WeatherBit Air Quality API request error: {e}")
                raise WeatherAPIError(f"Failed to connect to air quality API: {str(e)}")
