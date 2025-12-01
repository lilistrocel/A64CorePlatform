"""
Weather Service

Business logic for agricultural weather data.
Handles caching, farm location lookups, and data transformation.
"""

import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from uuid import UUID

from fastapi import HTTPException, status

from ...config.settings import settings
from ...models.weather import (
    CurrentWeather,
    SoilConditions,
    SolarData,
    AirQuality,
    AgriWeatherForecast,
    AgriWeatherForecastDay,
    AgriWeatherData,
    AgriculturalInsights,
)
from ..farm.farm_service import FarmService
from .weather_client import WeatherAPIClient, WeatherAPIError

logger = logging.getLogger(__name__)


class WeatherCache:
    """Simple in-memory cache for weather data"""

    def __init__(self):
        self._cache: Dict[str, Dict[str, Any]] = {}

    def get(self, key: str) -> Optional[Dict[str, Any]]:
        """Get cached data if not expired"""
        if key not in self._cache:
            return None

        entry = self._cache[key]
        if datetime.utcnow() > entry["expires_at"]:
            del self._cache[key]
            return None

        return entry["data"]

    def set(self, key: str, data: Dict[str, Any], ttl_seconds: int) -> None:
        """Cache data with TTL"""
        self._cache[key] = {
            "data": data,
            "cached_at": datetime.utcnow(),
            "expires_at": datetime.utcnow() + timedelta(seconds=ttl_seconds)
        }

    def invalidate(self, key: str) -> None:
        """Remove entry from cache"""
        if key in self._cache:
            del self._cache[key]

    def clear(self) -> None:
        """Clear entire cache"""
        self._cache.clear()


# Global cache instance
_weather_cache = WeatherCache()


class WeatherService:
    """Service for agricultural weather data"""

    def __init__(self):
        self.client = WeatherAPIClient()
        self.farm_service = FarmService()
        self.cache = _weather_cache

    async def _get_farm_coordinates(self, farm_id: UUID) -> tuple[float, float, str]:
        """
        Get farm coordinates from farm_id

        Returns:
            Tuple of (latitude, longitude, farm_name)

        Raises:
            HTTPException if farm not found or has no coordinates
        """
        farm = await self.farm_service.get_farm(farm_id)

        if not farm.location:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Farm does not have location data configured"
            )

        lat = farm.location.latitude
        lon = farm.location.longitude

        if lat is None or lon is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Farm does not have coordinates (latitude/longitude) configured"
            )

        return lat, lon, farm.name

    def _parse_current_weather(self, api_data: Dict[str, Any]) -> CurrentWeather:
        """Parse WeatherBit current weather response"""
        return CurrentWeather(
            latitude=api_data.get("lat", 0),
            longitude=api_data.get("lon", 0),
            city=api_data.get("city_name"),
            country=api_data.get("country_code"),
            timezone=api_data.get("timezone"),
            observedAt=datetime.fromisoformat(api_data.get("ob_time", datetime.utcnow().isoformat()).replace(" ", "T")),
            temperature=api_data.get("temp", 0),
            feelsLike=api_data.get("app_temp"),
            description=api_data.get("weather", {}).get("description", "Unknown"),
            icon=api_data.get("weather", {}).get("icon"),
            cloudCover=api_data.get("clouds"),
            precipitation=api_data.get("precip"),
            humidity=api_data.get("rh"),
            pressure=api_data.get("pres"),
            dewPoint=api_data.get("dewpt"),
            visibility=api_data.get("vis"),
            windSpeed=api_data.get("wind_spd"),
            windDirection=api_data.get("wind_dir"),
            windDirectionText=api_data.get("wind_cdir"),
            gustSpeed=api_data.get("gust"),
            uvIndex=api_data.get("uv"),
            solarRadiation=api_data.get("solar_rad"),
            airQualityIndex=api_data.get("aqi")
        )

    def _parse_soil_conditions(self, api_data: Dict[str, Any]) -> SoilConditions:
        """Parse soil conditions from AgWeather API response"""
        return SoilConditions(
            temp_0_10cm=api_data.get("soilt_0_10cm"),
            temp_10_40cm=api_data.get("soilt_10_40cm"),
            temp_40_100cm=api_data.get("soilt_40_100cm"),
            temp_100_200cm=api_data.get("soilt_100_200cm"),
            moisture_0_10cm=api_data.get("soilm_0_10cm"),
            moisture_10_40cm=api_data.get("soilm_10_40cm"),
            moisture_40_100cm=api_data.get("soilm_40_100cm"),
            moisture_100_200cm=api_data.get("soilm_100_200cm")
        )

    def _parse_solar_data(
        self,
        current_data: Optional[Dict[str, Any]],
        agweather_data: Optional[Dict[str, Any]] = None
    ) -> SolarData:
        """
        Parse solar and light data from current weather and ag-weather APIs

        Args:
            current_data: Current weather API response
            agweather_data: First day of AgWeather forecast (optional)

        Returns:
            SolarData object with all available solar/light metrics
        """
        solar = SolarData()

        if current_data:
            solar.solarRadiation = current_data.get("solar_rad")
            solar.uvIndex = current_data.get("uv")
            solar.ghi = current_data.get("ghi")
            solar.dni = current_data.get("dni")
            solar.dhi = current_data.get("dhi")
            solar.sunElevation = current_data.get("elev_angle")
            solar.sunAzimuth = current_data.get("h_angle")
            solar.sunrise = current_data.get("sunrise")
            solar.sunset = current_data.get("sunset")

        if agweather_data:
            solar.dswrfAvg = agweather_data.get("dswrf_avg")
            solar.dswrfMax = agweather_data.get("dswrf_max")
            solar.dlwrfAvg = agweather_data.get("dlwrf_avg")
            solar.dlwrfMax = agweather_data.get("dlwrf_max")

        return solar

    def _parse_air_quality(self, api_data: Dict[str, Any]) -> AirQuality:
        """Parse air quality data from WeatherBit API response"""
        # Determine AQI category based on EPA standards
        aqi = api_data.get("aqi")
        category = None
        if aqi is not None:
            if aqi <= 50:
                category = "Good"
            elif aqi <= 100:
                category = "Moderate"
            elif aqi <= 150:
                category = "Unhealthy for Sensitive Groups"
            elif aqi <= 200:
                category = "Unhealthy"
            elif aqi <= 300:
                category = "Very Unhealthy"
            else:
                category = "Hazardous"

        return AirQuality(
            aqi=aqi,
            aqiCategory=category,
            pm25=api_data.get("pm25"),
            pm10=api_data.get("pm10"),
            o3=api_data.get("o3"),
            no2=api_data.get("no2"),
            so2=api_data.get("so2"),
            co=api_data.get("co"),
            pollenTree=api_data.get("pollen_level_tree"),
            pollenGrass=api_data.get("pollen_level_grass"),
            pollenWeed=api_data.get("pollen_level_weed"),
            moldLevel=api_data.get("mold_level"),
            predominantPollen=api_data.get("predominant_pollen_type")
        )

    def _parse_agweather_forecast(
        self,
        api_data: Dict[str, Any],
        lat: float,
        lon: float
    ) -> AgriWeatherForecast:
        """Parse AgWeather forecast response"""
        days = []

        for day_data in api_data.get("data", []):
            soil = self._parse_soil_conditions(day_data)

            day = AgriWeatherForecastDay(
                date=day_data.get("valid_date", ""),
                tempHigh=day_data.get("max_temp"),
                tempLow=day_data.get("min_temp"),
                tempAvg=day_data.get("temp"),
                precipitation=day_data.get("precip"),
                precipitationProbability=day_data.get("pop"),
                humidity=day_data.get("rh"),
                windSpeed=day_data.get("wind_spd"),
                evapotranspiration=day_data.get("evapotranspiration"),
                soil=soil,
                solarRadiationAvg=day_data.get("t_solar_rad"),
                solarRadiationMax=day_data.get("max_solar_rad"),
                description=day_data.get("weather", {}).get("description") if isinstance(day_data.get("weather"), dict) else None,
                icon=day_data.get("weather", {}).get("icon") if isinstance(day_data.get("weather"), dict) else None
            )
            days.append(day)

        return AgriWeatherForecast(
            latitude=lat,
            longitude=lon,
            generatedAt=datetime.utcnow(),
            days=days
        )

    def _parse_standard_forecast(
        self,
        api_data: Dict[str, Any],
        lat: float,
        lon: float
    ) -> AgriWeatherForecast:
        """Parse standard forecast as fallback (no soil data)"""
        days = []

        for day_data in api_data.get("data", []):
            day = AgriWeatherForecastDay(
                date=day_data.get("valid_date", ""),
                tempHigh=day_data.get("max_temp"),
                tempLow=day_data.get("min_temp"),
                tempAvg=day_data.get("temp"),
                precipitation=day_data.get("precip"),
                precipitationProbability=day_data.get("pop"),
                humidity=day_data.get("rh"),
                windSpeed=day_data.get("wind_spd"),
                description=day_data.get("weather", {}).get("description") if isinstance(day_data.get("weather"), dict) else None,
                icon=day_data.get("weather", {}).get("icon") if isinstance(day_data.get("weather"), dict) else None
            )
            days.append(day)

        return AgriWeatherForecast(
            latitude=lat,
            longitude=lon,
            generatedAt=datetime.utcnow(),
            days=days
        )

    def _parse_combined_forecast(
        self,
        agweather_data: Optional[Dict[str, Any]],
        standard_data: Optional[Dict[str, Any]],
        lat: float,
        lon: float
    ) -> AgriWeatherForecast:
        """
        Combine AgWeather (soil data, evapotranspiration) with standard forecast (temperature)

        AgWeather API returns soil data but no temperature.
        Standard forecast API returns temperature but no soil data.
        This method merges both by matching dates.
        """
        days = []

        # Build lookup of standard forecast data by date
        standard_by_date: Dict[str, Dict[str, Any]] = {}
        if standard_data:
            for day_data in standard_data.get("data", []):
                date = day_data.get("valid_date", "")
                if date:
                    standard_by_date[date] = day_data

        # Build lookup of agweather data by date
        agweather_by_date: Dict[str, Dict[str, Any]] = {}
        if agweather_data:
            for day_data in agweather_data.get("data", []):
                date = day_data.get("valid_date", "")
                if date:
                    agweather_by_date[date] = day_data

        # Get all unique dates from both sources
        all_dates = sorted(set(list(standard_by_date.keys()) + list(agweather_by_date.keys())))

        for date in all_dates[:8]:  # Limit to 8 days
            std = standard_by_date.get(date, {})
            agw = agweather_by_date.get(date, {})

            # Parse soil data from agweather if available
            soil = None
            if agw:
                soil = self._parse_soil_conditions(agw)

            # Combine data - prefer standard forecast for temp/weather, agweather for soil/ET
            day = AgriWeatherForecastDay(
                date=date,
                # Temperature from standard forecast
                tempHigh=std.get("max_temp") or agw.get("max_temp"),
                tempLow=std.get("min_temp") or agw.get("min_temp"),
                tempAvg=std.get("temp") or agw.get("temp"),
                # Weather conditions from standard forecast
                precipitation=std.get("precip") or agw.get("precip"),
                precipitationProbability=std.get("pop"),
                humidity=std.get("rh") or agw.get("rh"),
                windSpeed=std.get("wind_spd") or agw.get("wind_spd"),
                description=std.get("weather", {}).get("description") if isinstance(std.get("weather"), dict) else None,
                icon=std.get("weather", {}).get("icon") if isinstance(std.get("weather"), dict) else None,
                # Agricultural data from agweather
                evapotranspiration=agw.get("evapotranspiration"),
                soil=soil,
                solarRadiationAvg=agw.get("t_solar_rad") or std.get("solar_rad"),
                solarRadiationMax=agw.get("max_solar_rad")
            )
            days.append(day)

        return AgriWeatherForecast(
            latitude=lat,
            longitude=lon,
            generatedAt=datetime.utcnow(),
            days=days
        )

    def _generate_insights(
        self,
        current: Optional[CurrentWeather],
        forecast: Optional[AgriWeatherForecast],
        soil: Optional[SoilConditions]
    ) -> AgriculturalInsights:
        """Generate agricultural insights from weather data"""
        recommendations = []
        alerts = []

        # Default values
        growing_conditions = "unknown"
        frost_risk = "none"
        drought_risk = "none"
        flood_risk = "none"
        heat_stress_risk = "none"
        soil_workability = "unknown"
        irrigation_need = "unknown"

        if current:
            temp = current.temperature

            # Frost risk assessment
            if temp <= 0:
                frost_risk = "high"
                alerts.append("FROST WARNING: Temperature is at or below freezing")
                recommendations.append("Protect frost-sensitive crops immediately")
            elif temp <= 4:
                frost_risk = "medium"
                alerts.append("Frost possible overnight")
                recommendations.append("Monitor temperatures and prepare frost protection")
            elif temp <= 8:
                frost_risk = "low"

            # Heat stress assessment
            if temp >= 38:
                heat_stress_risk = "high"
                alerts.append("HEAT STRESS WARNING: Extreme temperatures")
                recommendations.append("Increase irrigation frequency and provide shade for sensitive crops")
            elif temp >= 32:
                heat_stress_risk = "medium"
                recommendations.append("Monitor crop stress and ensure adequate water supply")
            elif temp >= 28:
                heat_stress_risk = "low"

            # Growing conditions based on temperature
            if 15 <= temp <= 28:
                growing_conditions = "excellent"
            elif 10 <= temp <= 32:
                growing_conditions = "good"
            elif 5 <= temp <= 35:
                growing_conditions = "fair"
            else:
                growing_conditions = "poor"

            # Humidity-based recommendations
            if current.humidity:
                if current.humidity > 90:
                    recommendations.append("High humidity - monitor for fungal diseases")
                    alerts.append("Disease risk: High humidity conditions")
                elif current.humidity < 30:
                    recommendations.append("Low humidity - crops may need additional irrigation")

            # Wind-based recommendations
            if current.windSpeed and current.windSpeed > 10:
                recommendations.append("High winds - check for crop damage and secure structures")
                if current.windSpeed > 15:
                    alerts.append("Strong wind warning - potential crop damage")

        # Forecast-based insights
        if forecast and forecast.days:
            total_precip = sum(d.precipitation or 0 for d in forecast.days[:7])
            avg_precip_per_day = total_precip / min(len(forecast.days), 7)

            # Drought risk
            if total_precip < 5:
                drought_risk = "high"
                recommendations.append("Little rainfall expected - plan irrigation schedule")
            elif total_precip < 15:
                drought_risk = "medium"
                recommendations.append("Below average rainfall - monitor soil moisture")
            elif total_precip < 30:
                drought_risk = "low"

            # Flood risk
            if total_precip > 100:
                flood_risk = "high"
                alerts.append("FLOOD RISK: Heavy rainfall expected this week")
                recommendations.append("Ensure drainage systems are clear")
            elif total_precip > 60:
                flood_risk = "medium"
                recommendations.append("Significant rainfall expected - check drainage")

            # Check for frost in forecast
            for day in forecast.days[:3]:
                if day.tempLow and day.tempLow <= 2:
                    if frost_risk == "none":
                        frost_risk = "low"
                    alerts.append(f"Frost possible on {day.date}")

        # Soil-based insights
        if soil:
            # Soil temperature assessment
            if soil.temp_0_10cm:
                if soil.temp_0_10cm < 10:
                    recommendations.append("Soil too cold for most seed germination")
                    soil_workability = "poor"
                elif soil.temp_0_10cm < 15:
                    recommendations.append("Soil warming - good for cool-season crops")
                    soil_workability = "fair"
                elif 15 <= soil.temp_0_10cm <= 25:
                    soil_workability = "excellent"
                else:
                    soil_workability = "good"

            # Soil moisture assessment
            if soil.moisture_0_10cm:
                # These are rough thresholds - actual values depend on soil type
                if soil.moisture_0_10cm < 10:
                    irrigation_need = "high"
                    recommendations.append("Topsoil moisture low - irrigation recommended")
                elif soil.moisture_0_10cm < 20:
                    irrigation_need = "moderate"
                elif soil.moisture_0_10cm < 40:
                    irrigation_need = "low"
                else:
                    irrigation_need = "none"
                    if soil.moisture_0_10cm > 50:
                        recommendations.append("High soil moisture - avoid heavy equipment")
                        soil_workability = "poor"

        # Add general recommendations if none generated
        if not recommendations:
            recommendations.append("Weather conditions are within normal parameters")
            recommendations.append("Continue regular farming operations")

        return AgriculturalInsights(
            growingConditions=growing_conditions,
            frostRisk=frost_risk,
            droughtRisk=drought_risk,
            floodRisk=flood_risk,
            heatStressRisk=heat_stress_risk,
            soilWorkability=soil_workability,
            irrigationNeed=irrigation_need,
            recommendations=recommendations,
            alerts=alerts
        )

    async def get_current_weather(self, farm_id: UUID) -> CurrentWeather:
        """
        Get current weather for a farm

        Args:
            farm_id: Farm UUID

        Returns:
            CurrentWeather object
        """
        lat, lon, _ = await self._get_farm_coordinates(farm_id)

        # Check cache
        cache_key = f"current:{farm_id}"
        cached = self.cache.get(cache_key)
        if cached:
            return CurrentWeather(**cached)

        try:
            api_data = await self.client.get_current_weather(lat, lon)
            weather = self._parse_current_weather(api_data)

            # Cache result
            self.cache.set(
                cache_key,
                weather.model_dump(),
                settings.WEATHERBIT_CACHE_TTL_CURRENT
            )

            return weather

        except WeatherAPIError as e:
            logger.error(f"Failed to get current weather for farm {farm_id}: {e.message}")
            raise HTTPException(
                status_code=e.status_code or status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Weather service error: {e.message}"
            )

    async def get_agri_forecast(self, farm_id: UUID) -> AgriWeatherForecast:
        """
        Get agricultural weather forecast for a farm

        Args:
            farm_id: Farm UUID

        Returns:
            AgriWeatherForecast object
        """
        lat, lon, _ = await self._get_farm_coordinates(farm_id)

        # Check cache
        cache_key = f"forecast:{farm_id}"
        cached = self.cache.get(cache_key)
        if cached:
            # Reconstruct forecast from cached data
            return AgriWeatherForecast(**cached)

        agweather_data = None
        standard_data = None

        # Get standard forecast for temperature data
        try:
            standard_data = await self.client.get_weather_forecast(lat, lon, days=8)
        except WeatherAPIError as e:
            logger.warning(f"Could not get standard forecast: {e.message}")

        # Try AgWeather endpoint for soil data
        try:
            agweather_data = await self.client.get_agweather_forecast(lat, lon)
        except WeatherAPIError as e:
            if e.status_code != 403:
                logger.warning(f"Could not get agweather forecast: {e.message}")
            else:
                logger.info(f"AgWeather API not available (requires Business plan) for farm {farm_id}")

        # Combine both data sources
        if agweather_data or standard_data:
            forecast = self._parse_combined_forecast(
                agweather_data, standard_data, lat, lon
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Weather service error: Could not retrieve forecast data"
            )

        # Cache result
        self.cache.set(
            cache_key,
            forecast.model_dump(mode="json"),
            settings.WEATHERBIT_CACHE_TTL_FORECAST
        )

        return forecast

    async def get_agri_data(self, farm_id: UUID) -> AgriWeatherData:
        """
        Get complete agricultural weather data for a farm

        Args:
            farm_id: Farm UUID

        Returns:
            AgriWeatherData with current, forecast, soil, solar, air quality, and insights
        """
        lat, lon, farm_name = await self._get_farm_coordinates(farm_id)

        current = None
        current_raw = None
        forecast = None
        soil = None
        solar = None
        air_quality = None
        agweather_first_day = None

        # Get current weather (store raw data for solar parsing)
        try:
            current_raw = await self.client.get_current_weather(lat, lon)
            current = self._parse_current_weather(current_raw)

            # Cache current weather
            cache_key = f"current:{farm_id}"
            self.cache.set(
                cache_key,
                current.model_dump(),
                settings.WEATHERBIT_CACHE_TTL_CURRENT
            )
        except WeatherAPIError as e:
            logger.warning(f"Could not get current weather for farm {farm_id}: {e.message}")

        # Get forecast
        try:
            forecast = await self.get_agri_forecast(farm_id)
            # Extract soil data from first forecast day if available
            if forecast.days and forecast.days[0].soil:
                soil = forecast.days[0].soil
        except HTTPException as e:
            logger.warning(f"Could not get forecast for farm {farm_id}: {e.detail}")

        # Get raw agweather data for solar radiation metrics
        try:
            agweather_raw = await self.client.get_agweather_forecast(lat, lon)
            if agweather_raw.get("data") and len(agweather_raw["data"]) > 0:
                agweather_first_day = agweather_raw["data"][0]
        except WeatherAPIError as e:
            if e.status_code != 403:
                logger.warning(f"Could not get agweather data for solar: {e.message}")

        # Parse solar data from current weather + agweather
        if current_raw or agweather_first_day:
            solar = self._parse_solar_data(current_raw, agweather_first_day)

        # Get air quality data
        try:
            air_quality_raw = await self.client.get_air_quality(lat, lon)
            air_quality = self._parse_air_quality(air_quality_raw)
        except WeatherAPIError as e:
            if e.status_code == 403:
                logger.info(f"Air Quality API not available (requires paid plan) for farm {farm_id}")
            else:
                logger.warning(f"Could not get air quality for farm {farm_id}: {e.message}")

        # Generate insights
        insights = self._generate_insights(current, forecast, soil)

        return AgriWeatherData(
            farmId=str(farm_id),
            farmName=farm_name,
            latitude=lat,
            longitude=lon,
            current=current,
            soil=soil,
            solar=solar,
            airQuality=air_quality,
            forecast=forecast,
            insights=insights,
            dataSource="weatherbit",
            lastUpdated=datetime.utcnow(),
            hasCurrentWeather=current is not None,
            hasSoilData=soil is not None,
            hasForecast=forecast is not None,
            hasSolarData=solar is not None,
            hasAirQuality=air_quality is not None
        )
