"""
Weather Data Models

Pydantic models for WeatherBit API integration and agricultural weather data.
"""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field


class SolarData(BaseModel):
    """Solar and light conditions"""

    # Current solar radiation
    solarRadiation: Optional[float] = Field(None, description="Solar radiation (W/m²)")
    uvIndex: Optional[float] = Field(None, ge=0, description="UV index (0-11+)")

    # Irradiance components
    ghi: Optional[float] = Field(None, description="Global Horizontal Irradiance (W/m²)")
    dni: Optional[float] = Field(None, description="Direct Normal Irradiance (W/m²)")
    dhi: Optional[float] = Field(None, description="Diffuse Horizontal Irradiance (W/m²)")

    # Sun position
    sunElevation: Optional[float] = Field(None, description="Sun elevation angle (degrees)")
    sunAzimuth: Optional[float] = Field(None, description="Sun hour angle (degrees)")

    # Sunrise/Sunset
    sunrise: Optional[str] = Field(None, description="Sunrise time (local)")
    sunset: Optional[str] = Field(None, description="Sunset time (local)")

    # Downward radiation (from ag-weather)
    dswrfAvg: Optional[float] = Field(None, description="Downward shortwave radiation avg (W/m²)")
    dswrfMax: Optional[float] = Field(None, description="Downward shortwave radiation max (W/m²)")
    dlwrfAvg: Optional[float] = Field(None, description="Downward longwave radiation avg (W/m²)")
    dlwrfMax: Optional[float] = Field(None, description="Downward longwave radiation max (W/m²)")


class AirQuality(BaseModel):
    """Air quality data"""

    # Air Quality Index (EPA standard 0-500)
    aqi: Optional[int] = Field(None, ge=0, description="Air Quality Index (EPA 0-500)")
    aqiCategory: Optional[str] = Field(None, description="AQI category (Good, Moderate, Unhealthy, etc.)")

    # Pollutants (µg/m³)
    pm25: Optional[float] = Field(None, ge=0, description="PM2.5 concentration (µg/m³)")
    pm10: Optional[float] = Field(None, ge=0, description="PM10 concentration (µg/m³)")
    o3: Optional[float] = Field(None, ge=0, description="Ozone concentration (µg/m³)")
    no2: Optional[float] = Field(None, ge=0, description="NO2 concentration (µg/m³)")
    so2: Optional[float] = Field(None, ge=0, description="SO2 concentration (µg/m³)")
    co: Optional[float] = Field(None, ge=0, description="CO concentration (µg/m³)")

    # Pollen levels (0=None, 1=Low, 2=Moderate, 3=High, 4=Very High)
    pollenTree: Optional[int] = Field(None, ge=0, le=4, description="Tree pollen level (0-4)")
    pollenGrass: Optional[int] = Field(None, ge=0, le=4, description="Grass pollen level (0-4)")
    pollenWeed: Optional[int] = Field(None, ge=0, le=4, description="Weed pollen level (0-4)")
    moldLevel: Optional[int] = Field(None, ge=0, le=4, description="Mold level (0-4)")
    predominantPollen: Optional[str] = Field(None, description="Predominant pollen type")


class SoilConditions(BaseModel):
    """Soil temperature and moisture at various depths"""

    # Soil temperature (Celsius) at different depths
    temp_0_10cm: Optional[float] = Field(None, description="Soil temperature 0-10cm depth (C)")
    temp_10_40cm: Optional[float] = Field(None, description="Soil temperature 10-40cm depth (C)")
    temp_40_100cm: Optional[float] = Field(None, description="Soil temperature 40-100cm depth (C)")
    temp_100_200cm: Optional[float] = Field(None, description="Soil temperature 100-200cm depth (C)")

    # Soil moisture (kg/m² or mm) at different depths
    moisture_0_10cm: Optional[float] = Field(None, description="Soil moisture 0-10cm depth (kg/m²)")
    moisture_10_40cm: Optional[float] = Field(None, description="Soil moisture 10-40cm depth (kg/m²)")
    moisture_40_100cm: Optional[float] = Field(None, description="Soil moisture 40-100cm depth (kg/m²)")
    moisture_100_200cm: Optional[float] = Field(None, description="Soil moisture 100-200cm depth (kg/m²)")


class CurrentWeather(BaseModel):
    """Current weather conditions"""

    # Location
    latitude: float = Field(..., description="Latitude")
    longitude: float = Field(..., description="Longitude")
    city: Optional[str] = Field(None, description="City name")
    country: Optional[str] = Field(None, description="Country code")
    timezone: Optional[str] = Field(None, description="Timezone")

    # Timestamp
    observedAt: datetime = Field(..., description="Observation timestamp")

    # Temperature
    temperature: float = Field(..., description="Temperature (C)")
    feelsLike: Optional[float] = Field(None, description="Feels like temperature (C)")

    # Conditions
    description: str = Field(..., description="Weather description")
    icon: Optional[str] = Field(None, description="Weather icon code")
    cloudCover: Optional[int] = Field(None, ge=0, le=100, description="Cloud cover (%)")

    # Precipitation
    precipitation: Optional[float] = Field(None, ge=0, description="Precipitation (mm)")
    precipitationProbability: Optional[int] = Field(None, ge=0, le=100, description="Precipitation probability (%)")

    # Atmospheric
    humidity: Optional[int] = Field(None, ge=0, le=100, description="Relative humidity (%)")
    pressure: Optional[float] = Field(None, description="Pressure (mb)")
    dewPoint: Optional[float] = Field(None, description="Dew point (C)")
    visibility: Optional[float] = Field(None, description="Visibility (km)")

    # Wind
    windSpeed: Optional[float] = Field(None, ge=0, description="Wind speed (m/s)")
    windDirection: Optional[int] = Field(None, ge=0, le=360, description="Wind direction (degrees)")
    windDirectionText: Optional[str] = Field(None, description="Wind direction (cardinal)")
    gustSpeed: Optional[float] = Field(None, ge=0, description="Wind gust speed (m/s)")

    # Solar
    uvIndex: Optional[float] = Field(None, ge=0, description="UV index")
    solarRadiation: Optional[float] = Field(None, description="Solar radiation (W/m²)")

    # Air quality (if available)
    airQualityIndex: Optional[int] = Field(None, description="Air quality index (EPA 0-500)")


class AgriWeatherForecastDay(BaseModel):
    """Single day agricultural weather forecast"""

    date: str = Field(..., description="Forecast date (YYYY-MM-DD)")

    # Temperature
    tempHigh: Optional[float] = Field(None, description="High temperature (C)")
    tempLow: Optional[float] = Field(None, description="Low temperature (C)")
    tempAvg: Optional[float] = Field(None, description="Average temperature (C)")

    # Precipitation
    precipitation: Optional[float] = Field(None, ge=0, description="Precipitation (mm)")
    precipitationProbability: Optional[int] = Field(None, ge=0, le=100, description="Precipitation probability (%)")

    # Humidity & Wind
    humidity: Optional[int] = Field(None, ge=0, le=100, description="Relative humidity (%)")
    windSpeed: Optional[float] = Field(None, ge=0, description="Wind speed (m/s)")

    # Agricultural specific
    evapotranspiration: Optional[float] = Field(None, description="Reference evapotranspiration ET0 (mm)")

    # Soil conditions
    soil: Optional[SoilConditions] = Field(None, description="Soil conditions")

    # Solar radiation
    solarRadiationAvg: Optional[float] = Field(None, description="Average solar radiation (W/m²)")
    solarRadiationMax: Optional[float] = Field(None, description="Max solar radiation (W/m²)")

    # Weather icon/description
    description: Optional[str] = Field(None, description="Weather description")
    icon: Optional[str] = Field(None, description="Weather icon code")


class AgriWeatherForecast(BaseModel):
    """Multi-day agricultural weather forecast"""

    latitude: float = Field(..., description="Latitude")
    longitude: float = Field(..., description="Longitude")
    generatedAt: datetime = Field(..., description="Forecast generation timestamp")
    days: List[AgriWeatherForecastDay] = Field(default_factory=list, description="Daily forecasts")


class AgriculturalInsights(BaseModel):
    """Agricultural insights and recommendations based on weather data"""

    # Growing conditions assessment
    growingConditions: str = Field(..., description="Overall growing conditions: excellent, good, fair, poor")

    # Risk assessments
    frostRisk: str = Field("none", description="Frost risk level: none, low, medium, high")
    droughtRisk: str = Field("none", description="Drought risk level: none, low, medium, high")
    floodRisk: str = Field("none", description="Flood risk level: none, low, medium, high")
    heatStressRisk: str = Field("none", description="Heat stress risk level: none, low, medium, high")

    # Soil assessments
    soilWorkability: str = Field("unknown", description="Soil workability: excellent, good, fair, poor, unknown")
    irrigationNeed: str = Field("unknown", description="Irrigation need: none, low, moderate, high, unknown")

    # Recommendations
    recommendations: List[str] = Field(default_factory=list, description="List of agricultural recommendations")

    # Alerts
    alerts: List[str] = Field(default_factory=list, description="Weather-related alerts for agriculture")


class AgriWeatherData(BaseModel):
    """Combined agricultural weather data for a farm"""

    farmId: str = Field(..., description="Farm ID")
    farmName: str = Field(..., description="Farm name")

    # Location
    latitude: float = Field(..., description="Latitude")
    longitude: float = Field(..., description="Longitude")

    # Current conditions
    current: Optional[CurrentWeather] = Field(None, description="Current weather conditions")

    # Soil conditions (current)
    soil: Optional[SoilConditions] = Field(None, description="Current soil conditions")

    # Solar & Light data
    solar: Optional[SolarData] = Field(None, description="Solar and light conditions")

    # Air Quality
    airQuality: Optional[AirQuality] = Field(None, description="Air quality data")

    # Forecast
    forecast: Optional[AgriWeatherForecast] = Field(None, description="Agricultural weather forecast")

    # Insights
    insights: Optional[AgriculturalInsights] = Field(None, description="Agricultural insights and recommendations")

    # Metadata
    dataSource: str = Field("weatherbit", description="Weather data source")
    lastUpdated: datetime = Field(default_factory=datetime.utcnow, description="Last data update timestamp")

    # Data availability flags
    hasCurrentWeather: bool = Field(False, description="Current weather data available")
    hasSoilData: bool = Field(False, description="Soil data available")
    hasForecast: bool = Field(False, description="Forecast data available")
    hasSolarData: bool = Field(False, description="Solar/light data available")
    hasAirQuality: bool = Field(False, description="Air quality data available")


class WeatherCacheEntry(BaseModel):
    """Cache entry for weather data"""

    key: str = Field(..., description="Cache key (farm_id + data_type)")
    data: dict = Field(..., description="Cached data")
    cachedAt: datetime = Field(default_factory=datetime.utcnow, description="Cache timestamp")
    expiresAt: datetime = Field(..., description="Cache expiration timestamp")
