/**
 * Logistics Module Types
 *
 * Type definitions for the Logistics module (Fleet & Shipment Management).
 */

// ============================================================================
// VEHICLE TYPES
// ============================================================================

export type VehicleType = 'truck' | 'van' | 'pickup' | 'refrigerated';
export type VehicleOwnership = 'owned' | 'rented' | 'leased';
export type VehicleStatus = 'available' | 'in_use' | 'maintenance' | 'retired';

export interface VehicleCapacity {
  weight?: number;
  volume?: number;
  unit?: string;
}

export interface Vehicle {
  vehicleId: string;
  vehicleCode: string;
  name: string;
  type: VehicleType;
  ownership: VehicleOwnership;
  licensePlate: string;
  capacity?: VehicleCapacity;
  status: VehicleStatus;
  costPerKm?: number;
  rentalCostPerDay?: number;
  purchaseDate?: string;
  purchaseCost?: number;
  maintenanceSchedule?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface VehicleCreate {
  name: string;
  type: VehicleType;
  ownership: VehicleOwnership;
  licensePlate: string;
  capacity?: VehicleCapacity;
  status?: VehicleStatus;
  costPerKm?: number;
  rentalCostPerDay?: number;
  purchaseDate?: string;
  purchaseCost?: number;
  maintenanceSchedule?: string;
}

export interface VehicleUpdate {
  name?: string;
  type?: VehicleType;
  ownership?: VehicleOwnership;
  licensePlate?: string;
  capacity?: VehicleCapacity;
  status?: VehicleStatus;
  costPerKm?: number;
  rentalCostPerDay?: number;
  purchaseDate?: string;
  purchaseCost?: number;
  maintenanceSchedule?: string;
}

export interface VehicleSearchParams {
  page?: number;
  perPage?: number;
  search?: string;
  type?: VehicleType;
  status?: VehicleStatus;
  ownership?: VehicleOwnership;
}

export interface PaginatedVehicles {
  items: Vehicle[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

// ============================================================================
// ROUTE TYPES
// ============================================================================

export interface Location {
  name: string;
  address: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
}

export interface Route {
  routeId: string;
  routeCode: string;
  name: string;
  origin: Location;
  destination: Location;
  distance?: number;
  estimatedDuration?: number;
  estimatedCost?: number;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface RouteCreate {
  name: string;
  origin: Location;
  destination: Location;
  distance?: number;
  estimatedDuration?: number;
  estimatedCost?: number;
  isActive?: boolean;
}

export interface RouteUpdate {
  name?: string;
  origin?: Location;
  destination?: Location;
  distance?: number;
  estimatedDuration?: number;
  estimatedCost?: number;
  isActive?: boolean;
}

export interface RouteSearchParams {
  page?: number;
  perPage?: number;
  search?: string;
  isActive?: boolean;
}

export interface PaginatedRoutes {
  items: Route[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

// ============================================================================
// SHIPMENT TYPES
// ============================================================================

export type ShipmentStatus = 'scheduled' | 'in_transit' | 'delivered' | 'cancelled';

export interface CargoItem {
  description: string;
  quantity: number;
  weight?: number;
}

export interface Shipment {
  shipmentId: string;
  shipmentCode: string;
  routeId: string;
  vehicleId: string;
  driverId?: string;
  status: ShipmentStatus;
  scheduledDate: string;
  actualDepartureDate?: string;
  actualArrivalDate?: string;
  cargo: CargoItem[];
  totalCost?: number;
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ShipmentCreate {
  routeId: string;
  vehicleId: string;
  driverId?: string;
  scheduledDate: string;
  cargo: CargoItem[];
  notes?: string;
}

export interface ShipmentUpdate {
  routeId?: string;
  vehicleId?: string;
  driverId?: string;
  scheduledDate?: string;
  actualDepartureDate?: string;
  actualArrivalDate?: string;
  cargo?: CargoItem[];
  totalCost?: number;
  notes?: string;
}

export interface ShipmentStatusUpdate {
  status: ShipmentStatus;
  actualDepartureDate?: string;
  actualArrivalDate?: string;
}

export interface ShipmentSearchParams {
  page?: number;
  perPage?: number;
  search?: string;
  status?: ShipmentStatus;
  vehicleId?: string;
  routeId?: string;
  farmingYear?: number;
}

export interface PaginatedShipments {
  items: Shipment[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

// ============================================================================
// DASHBOARD TYPES
// ============================================================================

export interface LogisticsDashboardStats {
  totalVehicles: number;
  availableVehicles: number;
  inUseVehicles: number;
  maintenanceVehicles: number;
  totalShipments: number;
  scheduledShipments: number;
  inTransitShipments: number;
  deliveredShipments: number;
  activeRoutes: number;
  totalRoutes: number;
  recentShipments?: Shipment[];
  upcomingMaintenances?: {
    vehicleId: string;
    vehicleName: string;
    nextMaintenanceDate: string;
  }[];
}

// ============================================================================
// FARMING YEAR TYPES
// ============================================================================

/**
 * Farming year item for logistics module
 */
export interface LogisticsFarmingYearItem {
  year: number;
  display: string;
  isCurrent: boolean;
  hasShipments: boolean;
  shipmentCount: number;
}

/**
 * Response from logistics farming years endpoint
 */
export interface LogisticsFarmingYearsResponse {
  years: LogisticsFarmingYearItem[];
  count: number;
  currentYear: number;
  startMonth: number;
  startMonthName: string;
}

/**
 * Parameters for dashboard stats with farming year filter
 */
export interface LogisticsDashboardParams {
  farmingYear?: number;
}
