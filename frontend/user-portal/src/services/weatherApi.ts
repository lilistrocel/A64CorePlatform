/**
 * Weather & Agricultural Data API Service
 *
 * This service provides API calls for WeatherBit agricultural weather data.
 * All endpoints use the /api/v1/farm base URL.
 */

import { apiClient } from './api';
import type {
  CurrentWeather,
  AgriWeatherForecast,
  AgriWeatherData,
} from '../types/farm';

// ============================================================================
// WEATHER API ENDPOINTS
// ============================================================================

/**
 * Get current weather for a farm
 *
 * @param farmId - The farm UUID
 * @returns Current weather conditions
 */
export async function getCurrentWeather(farmId: string): Promise<CurrentWeather> {
  const response = await apiClient.get<{ data: CurrentWeather }>(
    `/v1/farm/farms/${farmId}/weather/current`
  );
  return response.data.data;
}

/**
 * Get agricultural weather forecast for a farm
 *
 * @param farmId - The farm UUID
 * @returns 8-day agricultural weather forecast with soil data
 */
export async function getWeatherForecast(farmId: string): Promise<AgriWeatherForecast> {
  const response = await apiClient.get<{ data: AgriWeatherForecast }>(
    `/v1/farm/farms/${farmId}/weather/forecast`
  );
  return response.data.data;
}

/**
 * Get complete agricultural weather data for a farm
 *
 * Includes current weather, forecast, soil conditions, and AI-generated insights
 *
 * @param farmId - The farm UUID
 * @returns Complete agricultural weather data with insights
 */
export async function getAgriData(farmId: string): Promise<AgriWeatherData> {
  const response = await apiClient.get<{ data: AgriWeatherData }>(
    `/v1/farm/farms/${farmId}/weather/agri-data`
  );
  return response.data.data;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Format temperature for display
 *
 * @param temp - Temperature in Celsius
 * @param decimals - Number of decimal places (default: 1)
 * @returns Formatted temperature string with unit
 */
export function formatTemperature(temp: number | undefined, decimals: number = 1): string {
  if (temp === undefined || temp === null) return 'N/A';
  return `${temp.toFixed(decimals)}°C`;
}

/**
 * Format wind speed for display
 *
 * @param speed - Wind speed in m/s
 * @returns Formatted wind speed string with unit
 */
export function formatWindSpeed(speed: number | undefined): string {
  if (speed === undefined || speed === null) return 'N/A';
  return `${speed.toFixed(1)} m/s`;
}

/**
 * Format humidity for display
 *
 * @param humidity - Humidity percentage
 * @returns Formatted humidity string
 */
export function formatHumidity(humidity: number | undefined): string {
  if (humidity === undefined || humidity === null) return 'N/A';
  return `${humidity}%`;
}

/**
 * Format precipitation for display
 *
 * @param precip - Precipitation in mm
 * @returns Formatted precipitation string
 */
export function formatPrecipitation(precip: number | undefined): string {
  if (precip === undefined || precip === null) return 'N/A';
  return `${precip.toFixed(1)} mm`;
}

/**
 * Format soil moisture for display
 *
 * @param moisture - Soil moisture in kg/m²
 * @returns Formatted soil moisture string
 */
export function formatSoilMoisture(moisture: number | undefined): string {
  if (moisture === undefined || moisture === null) return 'N/A';
  return `${moisture.toFixed(1)} kg/m²`;
}

/**
 * Format date for display
 *
 * @param dateStr - ISO date string
 * @returns Formatted date string
 */
export function formatWeatherDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format datetime for display
 *
 * @param dateStr - ISO datetime string
 * @returns Formatted datetime string
 */
export function formatWeatherDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Get weather icon URL from WeatherBit icon code
 *
 * @param iconCode - WeatherBit icon code (e.g., 'c01d')
 * @returns URL to weather icon
 */
export function getWeatherIconUrl(iconCode: string | undefined): string {
  if (!iconCode) return '';
  // WeatherBit provides icons at this URL pattern
  return `https://www.weatherbit.io/static/img/icons/${iconCode}.png`;
}

/**
 * Get wind direction as arrow character
 *
 * @param degrees - Wind direction in degrees
 * @returns Arrow character representing wind direction
 */
export function getWindDirectionArrow(degrees: number | undefined): string {
  if (degrees === undefined || degrees === null) return '';

  // Normalize degrees to 0-360
  const normalized = ((degrees % 360) + 360) % 360;

  // Map degrees to arrow characters (pointing in the direction wind is coming FROM)
  // North = 0°, East = 90°, South = 180°, West = 270°
  if (normalized >= 337.5 || normalized < 22.5) return '↓';   // N
  if (normalized >= 22.5 && normalized < 67.5) return '↙';    // NE
  if (normalized >= 67.5 && normalized < 112.5) return '←';   // E
  if (normalized >= 112.5 && normalized < 157.5) return '↖';  // SE
  if (normalized >= 157.5 && normalized < 202.5) return '↑';  // S
  if (normalized >= 202.5 && normalized < 247.5) return '↗';  // SW
  if (normalized >= 247.5 && normalized < 292.5) return '→';  // W
  if (normalized >= 292.5 && normalized < 337.5) return '↘';  // NW

  return '';
}

// Export grouped API object for convenience
export const weatherApi = {
  getCurrentWeather,
  getWeatherForecast,
  getAgriData,
  formatTemperature,
  formatWindSpeed,
  formatHumidity,
  formatPrecipitation,
  formatSoilMoisture,
  formatWeatherDate,
  formatWeatherDateTime,
  getWeatherIconUrl,
  getWindDirectionArrow,
};
