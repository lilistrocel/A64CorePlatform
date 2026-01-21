/**
 * Logistics API Service
 *
 * This service provides all API calls for the Logistics module (Fleet & Shipment Management).
 * All endpoints use the /api/v1/logistics base URL.
 */

import { apiClient } from './api';
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
 */
export async function getDashboardStats(): Promise<LogisticsDashboardStats> {
  const response = await apiClient.get<{ data: LogisticsDashboardStats }>('/v1/logistics/dashboard');
  return response.data.data;
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
    parts.push(`${capacity.weight} kg`);
  }
  if (capacity.volume) {
    parts.push(`${capacity.volume} ${capacity.unit || 'm³'}`);
  }

  return parts.length > 0 ? parts.join(', ') : 'N/A';
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

  // Utilities
  getVehicleStatusColor,
  getShipmentStatusColor,
  getVehicleTypeLabel,
  formatCapacity,
  formatLocation,
  calculateTotalCargoWeight,
};

export default logisticsApi;
