/**
 * Logistics API Service
 *
 * This service provides all API calls for the Logistics module (Fleet & Shipment Management).
 * All endpoints use the /api/v1/logistics base URL.
 */

import { apiClient } from './api';
import { formatNumber } from '../utils/formatNumber';
import type {
  Vehicle,
  VehicleCreate,
  VehicleUpdate,
  VehicleSearchParams,
  PaginatedVehicles,
  Route,
  RouteCreate,
  RouteUpdate,
  RouteSearchParams,
  PaginatedRoutes,
  Shipment,
  ShipmentCreate,
  ShipmentUpdate,
  ShipmentStatusUpdate,
  ShipmentSearchParams,
  PaginatedShipments,
  LogisticsDashboardStats,
  LogisticsFarmingYearsResponse,
  LogisticsDashboardParams,
} from '../types/logistics';

// ============================================================================
// VEHICLE MANAGEMENT ENDPOINTS
// ============================================================================

/**
 * Get all vehicles with search and pagination
 */
export async function getVehicles(params?: VehicleSearchParams): Promise<PaginatedVehicles> {
  const response = await apiClient.get<any>('/v1/logistics/vehicles', {
    params: {
      page: params?.page || 1,
      perPage: params?.perPage || 20,
      search: params?.search,
      type: params?.type,
      status: params?.status,
      ownership: params?.ownership,
    },
  });

  return {
    items: response.data.data || [],
    total: response.data.meta?.total || 0,
    page: response.data.meta?.page || 1,
    perPage: response.data.meta?.perPage || 20,
    totalPages: response.data.meta?.totalPages || 1,
  };
}

/**
 * Get available vehicles
 */
export async function getAvailableVehicles(): Promise<Vehicle[]> {
  const response = await apiClient.get<{ data: Vehicle[] }>('/v1/logistics/vehicles/available');
  return response.data.data;
}

/**
 * Get a single vehicle by ID
 */
export async function getVehicle(vehicleId: string): Promise<Vehicle> {
  const response = await apiClient.get<{ data: Vehicle }>(`/v1/logistics/vehicles/${vehicleId}`);
  return response.data.data;
}

/**
 * Create new vehicle
 */
export async function createVehicle(data: VehicleCreate): Promise<Vehicle> {
  const response = await apiClient.post<{ data: Vehicle }>('/v1/logistics/vehicles', data);
  return response.data.data;
}

/**
 * Update existing vehicle
 */
export async function updateVehicle(vehicleId: string, data: VehicleUpdate): Promise<Vehicle> {
  const response = await apiClient.patch<{ data: Vehicle }>(`/v1/logistics/vehicles/${vehicleId}`, data);
  return response.data.data;
}

/**
 * Delete vehicle
 */
export async function deleteVehicle(vehicleId: string): Promise<{ message: string }> {
  const response = await apiClient.delete<{ message: string }>(`/v1/logistics/vehicles/${vehicleId}`);
  return response.data;
}

// ============================================================================
// ROUTE MANAGEMENT ENDPOINTS
// ============================================================================

/**
 * Get all routes with search and pagination
 */
export async function getRoutes(params?: RouteSearchParams): Promise<PaginatedRoutes> {
  const response = await apiClient.get<any>('/v1/logistics/routes', {
    params: {
      page: params?.page || 1,
      perPage: params?.perPage || 20,
      search: params?.search,
      isActive: params?.isActive,
    },
  });

  return {
    items: response.data.data || [],
    total: response.data.meta?.total || 0,
    page: response.data.meta?.page || 1,
    perPage: response.data.meta?.perPage || 20,
    totalPages: response.data.meta?.totalPages || 1,
  };
}

/**
 * Get a single route by ID
 */
export async function getRoute(routeId: string): Promise<Route> {
  const response = await apiClient.get<{ data: Route }>(`/v1/logistics/routes/${routeId}`);
  return response.data.data;
}

/**
 * Create new route
 */
export async function createRoute(data: RouteCreate): Promise<Route> {
  const response = await apiClient.post<{ data: Route }>('/v1/logistics/routes', data);
  return response.data.data;
}

/**
 * Update existing route
 */
export async function updateRoute(routeId: string, data: RouteUpdate): Promise<Route> {
  const response = await apiClient.patch<{ data: Route }>(`/v1/logistics/routes/${routeId}`, data);
  return response.data.data;
}

/**
 * Delete route
 */
export async function deleteRoute(routeId: string): Promise<{ message: string }> {
  const response = await apiClient.delete<{ message: string }>(`/v1/logistics/routes/${routeId}`);
  return response.data;
}

// ============================================================================
// SHIPMENT MANAGEMENT ENDPOINTS
// ============================================================================

/**
 * Get all shipments with search and pagination
 * @param params - Search parameters including optional farmingYear filter
 */
export async function getShipments(params?: ShipmentSearchParams): Promise<PaginatedShipments> {
  const response = await apiClient.get<any>('/v1/logistics/shipments', {
    params: {
      page: params?.page || 1,
      perPage: params?.perPage || 20,
      search: params?.search,
      status: params?.status,
      vehicleId: params?.vehicleId,
      routeId: params?.routeId,
      farmingYear: params?.farmingYear,
    },
  });

  return {
    items: response.data.data || [],
    total: response.data.meta?.total || 0,
    page: response.data.meta?.page || 1,
    perPage: response.data.meta?.perPage || 20,
    totalPages: response.data.meta?.totalPages || 1,
  };
}

/**
 * Get a single shipment by ID
 */
export async function getShipment(shipmentId: string): Promise<Shipment> {
  const response = await apiClient.get<{ data: Shipment }>(`/v1/logistics/shipments/${shipmentId}`);
  return response.data.data;
}

/**
 * Create new shipment
 */
export async function createShipment(data: ShipmentCreate): Promise<Shipment> {
  const response = await apiClient.post<{ data: Shipment }>('/v1/logistics/shipments', data);
  return response.data.data;
}

/**
 * Update existing shipment
 */
export async function updateShipment(shipmentId: string, data: ShipmentUpdate): Promise<Shipment> {
  const response = await apiClient.patch<{ data: Shipment }>(`/v1/logistics/shipments/${shipmentId}`, data);
  return response.data.data;
}

/**
 * Update shipment status
 */
export async function updateShipmentStatus(shipmentId: string, data: ShipmentStatusUpdate): Promise<Shipment> {
  const response = await apiClient.patch<{ data: Shipment }>(`/v1/logistics/shipments/${shipmentId}/status`, data);
  return response.data.data;
}

/**
 * Delete shipment
 */
export async function deleteShipment(shipmentId: string): Promise<{ message: string }> {
  const response = await apiClient.delete<{ message: string }>(`/v1/logistics/shipments/${shipmentId}`);
  return response.data;
}

// ============================================================================
// DASHBOARD ENDPOINT
// ============================================================================

/**
 * Get logistics dashboard statistics
 * @param params - Optional parameters including farmingYear filter
 */
export async function getDashboardStats(params?: LogisticsDashboardParams): Promise<LogisticsDashboardStats> {
  const response = await apiClient.get<{ data: LogisticsDashboardStats }>('/v1/logistics/dashboard', {
    params: {
      farmingYear: params?.farmingYear,
    },
  });
  return response.data.data;
}

// ============================================================================
// FARMING YEAR ENDPOINTS
// ============================================================================

/**
 * Get available farming years for logistics module
 * Returns distinct farming years that have shipment data
 */
export async function getAvailableFarmingYears(): Promise<LogisticsFarmingYearsResponse> {
  const response = await apiClient.get<LogisticsFarmingYearsResponse>('/v1/logistics/config/farming-years');
  return response.data;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get vehicle status color
 */
export function getVehicleStatusColor(status: string): string {
  switch (status) {
    case 'available':
      return '#10B981'; // green
    case 'in_use':
      return '#3B82F6'; // blue
    case 'maintenance':
      return '#F59E0B'; // amber
    case 'retired':
      return '#6B7280'; // gray
    default:
      return '#6B7280';
  }
}

/**
 * Get shipment status color
 */
export function getShipmentStatusColor(status: string): string {
  switch (status) {
    case 'scheduled':
      return '#3B82F6'; // blue
    case 'in_transit':
      return '#F59E0B'; // amber
    case 'delivered':
      return '#10B981'; // green
    case 'cancelled':
      return '#EF4444'; // red
    default:
      return '#6B7280';
  }
}

/**
 * Get vehicle type label
 */
export function getVehicleTypeLabel(type: string): string {
  switch (type) {
    case 'truck':
      return 'Truck';
    case 'van':
      return 'Van';
    case 'pickup':
      return 'Pickup';
    case 'refrigerated':
      return 'Refrigerated';
    default:
      return type;
  }
}

/**
 * Format capacity for display
 */
export function formatCapacity(capacity?: { weight?: number; volume?: number; unit?: string }): string {
  if (!capacity) return 'N/A';

  const parts: string[] = [];
  if (capacity.weight) {
    parts.push(`${formatNumber(capacity.weight)} kg`);
  }
  if (capacity.volume) {
    parts.push(`${formatNumber(capacity.volume)} ${capacity.unit || 'm³'}`);
  }

  return parts.length > 0 ? parts.join(', ') : 'N/A';
}

/**
 * Format distance with unit
 */
export function formatDistance(distance?: number): string {
  if (distance === undefined || distance === null) return '-';
  return `${formatNumber(distance, { decimals: 1 })} km`;
}

/**
 * Format duration (minutes to hours/minutes)
 */
export function formatDuration(minutes?: number): string {
  if (minutes === undefined || minutes === null) return '-';
  const hours = minutes / 60;
  return `${formatNumber(hours, { decimals: 1 })} hrs`;
}

/**
 * Format weight with unit
 */
export function formatWeight(weight?: number): string {
  if (weight === undefined || weight === null) return '-';
  return `${formatNumber(weight)} kg`;
}

/**
 * Format location for display
 */
export function formatLocation(location: { name: string; address: string }): string {
  return `${location.name} (${location.address})`;
}

/**
 * Calculate total cargo weight
 */
export function calculateTotalCargoWeight(cargo: { weight?: number }[]): number {
  return cargo.reduce((total, item) => total + (item.weight || 0), 0);
}

// Export all functions as a single object for convenience
export const logisticsApi = {
  // Vehicles
  getVehicles,
  getAvailableVehicles,
  getVehicle,
  createVehicle,
  updateVehicle,
  deleteVehicle,

  // Routes
  getRoutes,
  getRoute,
  createRoute,
  updateRoute,
  deleteRoute,

  // Shipments
  getShipments,
  getShipment,
  createShipment,
  updateShipment,
  updateShipmentStatus,
  deleteShipment,

  // Dashboard
  getDashboardStats,

  // Farming Year
  getAvailableFarmingYears,

  // Utilities
  getVehicleStatusColor,
  getShipmentStatusColor,
  getVehicleTypeLabel,
  formatCapacity,
  formatLocation,
  formatDistance,
  formatDuration,
  formatWeight,
  calculateTotalCargoWeight,
};

export default logisticsApi;
