/**
 * Sales Module Types (trimmed — T-200.11 legacy cutover)
 *
 * Types removed in T-200.11:
 *  - SalesOrderCreate, SalesOrderUpdate, SalesOrderSearchParams, PaginatedSalesOrders
 *    (legacy order CRUD — Wave 3 types live in salesApi.ts)
 *  - ReturnReason, ReturnCondition, ReturnStatus, ReturnItem, ReturnOrder,
 *    ReturnOrderCreate, PaginatedReturns (legacy returns — Wave 3 types live in salesApi.ts)
 *
 * Types kept:
 *  - SalesOrder and its shape dependencies (still referenced by SalesDashboardStats.recentOrders)
 *  - SalesDashboardStats, DashboardStockItem
 *  - WasteInventory, WasteSummary, WasteSourceType, DisposalMethod, PaginatedWaste
 *  - FarmingYearItem, FarmingYearContext
 */

// ============================================================================
// ORDER TYPES (minimal shape needed by SalesDashboardStats.recentOrders)
// ============================================================================

export type OrderStatus =
  | 'draft'
  | 'confirmed'
  | 'processing'
  | 'assigned'
  | 'in_transit'
  | 'shipped'
  | 'delivered'
  | 'partially_returned'
  | 'returned'
  | 'cancelled';

export type PaymentStatus = 'pending' | 'partial' | 'paid';

/**
 * Per-batch allocation traceability on a legacy order item.
 */
export interface OrderItemAllocation {
  inventorySource: 'harvest' | 'returned';
  inventoryId: string;
  farmId?: string | null;
  farmName?: string | null;
  quantity: number;
}

export interface OrderItem {
  productId?: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  inventoryId?: string;
  qualityGrade?: string;
  sourceType?: 'fresh' | 'returned';
  allocations?: OrderItemAllocation[];
  containerCount?: number | null;
  containerSize?: number | null;
}

export interface ShippingAddress {
  street?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
}

export interface SalesOrderReturnRecord {
  orderItemIndex: number;
  quantity: number;
  condition: 'sellable' | 'spoiled';
  reason?: string;
  disposalMethod?: string;
  returnedAt?: string;
}

export interface SalesOrder {
  orderId: string;
  orderCode: string;
  customerId: string;
  customerName?: string;
  status: OrderStatus;
  orderDate: string;
  items: OrderItem[];
  subtotal: number;
  tax?: number;
  discount?: number;
  total: number;
  paymentStatus: PaymentStatus;
  shippingAddress?: ShippingAddress;
  notes?: string;
  shipmentId?: string;
  returns?: SalesOrderReturnRecord[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// DASHBOARD TYPES
// ============================================================================

/** Minimal stock item shape used inside dashboard widgets */
export interface DashboardStockItem {
  inventoryId: string;
  productName: string;
  expiryDate?: string;
  quantity?: number;
  unit?: string;
}

export interface SalesDashboardStats {
  totalOrders: number;
  confirmedOrders: number;
  shippedOrders: number;
  deliveredOrders: number;
  totalRevenue: number;
  pendingPayments: number;
  totalInventory: number;
  availableInventory: number;
  reservedInventory: number;
  soldInventory: number;
  totalPurchaseOrders: number;
  sentPurchaseOrders: number;
  confirmedPurchaseOrders: number;
  receivedPurchaseOrders: number;
  recentOrders?: SalesOrder[];
  lowStockItems?: DashboardStockItem[];
  expiringItems?: DashboardStockItem[];
  farmingYearContext?: FarmingYearContext;
}

// ============================================================================
// WASTE INVENTORY TYPES
// ============================================================================

export type WasteSourceType =
  | 'harvest'
  | 'return'
  | 'expired'
  | 'damaged'
  | 'quality_reject'
  | 'other';

export type DisposalMethod =
  | 'compost'
  | 'animal_feed'
  | 'discard'
  | 'sold_discount'
  | 'donated'
  | 'pending';

export interface WasteInventory {
  wasteId: string;
  organizationId: string;
  farmId?: string;
  sourceType: WasteSourceType;
  sourceInventoryId?: string;
  sourceOrderId?: string;
  sourceReturnId?: string;
  plantName: string;
  variety?: string;
  quantity: number;
  unit: string;
  originalGrade?: string;
  wasteReason: string;
  wasteDate: string;
  disposalMethod: DisposalMethod;
  disposalDate?: string;
  disposalNotes?: string;
  estimatedValue?: number;
  currency: string;
  notes?: string;
  recordedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface WasteInventoryCreate {
  organizationId: string;
  farmId?: string;
  sourceType: WasteSourceType;
  sourceInventoryId?: string;
  plantName: string;
  quantity: number;
  unit: string;
  wasteReason: string;
}

export interface WasteSummary {
  totalWasteRecords: number;
  totalQuantity: number;
  totalEstimatedValue: number;
  bySourceType: Record<string, { count: number; quantity: number }>;
  byDisposalMethod: Record<string, { count: number; quantity: number }>;
  pendingDisposal: number;
}

export interface PaginatedWaste {
  items: WasteInventory[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

// ============================================================================
// FARMING YEAR TYPES
// ============================================================================

/**
 * Farming year item for dropdown selection
 */
export interface FarmingYearItem {
  year: number;
  display: string;
  isCurrent: boolean;
  hasOrders?: boolean;
  orderCount?: number;
}

/**
 * Farming year context in dashboard response
 */
export interface FarmingYearContext {
  farmingYear: number | null;
  isFiltered: boolean;
}
