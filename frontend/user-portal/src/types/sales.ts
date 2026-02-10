/**
 * Sales Module Types
 *
 * Type definitions for the Sales module (Orders, Inventory, and Purchase Orders).
 */

// ============================================================================
// ORDER TYPES
// ============================================================================

export type OrderStatus = 'draft' | 'confirmed' | 'processing' | 'assigned' | 'in_transit' | 'shipped' | 'delivered' | 'partially_returned' | 'returned' | 'cancelled';
export type PaymentStatus = 'pending' | 'partial' | 'paid';

export interface OrderItem {
  productId?: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  // Inventory integration fields
  inventoryId?: string;
  qualityGrade?: string;
  sourceType?: 'fresh' | 'returned';
}

export interface ShippingAddress {
  street?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
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
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface SalesOrderCreate {
  customerId: string;
  customerName: string;
  orderDate: string;
  items: OrderItem[];
  subtotal: number;
  tax?: number;
  discount?: number;
  total: number;
  paymentStatus?: PaymentStatus;
  shippingAddress?: ShippingAddress;
  notes?: string;
}

export interface SalesOrderUpdate {
  customerId?: string;
  customerName?: string;
  status?: OrderStatus;
  orderDate?: string;
  items?: OrderItem[];
  subtotal?: number;
  tax?: number;
  discount?: number;
  total?: number;
  paymentStatus?: PaymentStatus;
  shippingAddress?: ShippingAddress;
  notes?: string;
}

export interface SalesOrderSearchParams {
  page?: number;
  perPage?: number;
  search?: string;
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
  customerId?: string;
  farmingYear?: number;
}

export interface PaginatedSalesOrders {
  items: SalesOrder[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

// ============================================================================
// INVENTORY TYPES
// ============================================================================

export type InventoryStatus = 'available' | 'reserved' | 'sold' | 'expired';
export type QualityGrade = 'A' | 'B' | 'C';
export type InventoryUnit = 'kg' | 'pieces' | 'bunches';

export interface HarvestInventory {
  inventoryId: string;
  productName: string;
  category?: string;
  farmId?: string;
  blockId?: string;
  harvestDate?: string;
  quantity: number;
  unit: InventoryUnit;
  quality?: QualityGrade;
  status: InventoryStatus;
  expiryDate?: string;
  storageLocation?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface HarvestInventoryCreate {
  productName: string;
  category?: string;
  farmId?: string;
  blockId?: string;
  harvestDate?: string;
  quantity: number;
  unit: InventoryUnit;
  quality?: QualityGrade;
  status?: InventoryStatus;
  expiryDate?: string;
  storageLocation?: string;
}

export interface HarvestInventoryUpdate {
  productName?: string;
  category?: string;
  farmId?: string;
  blockId?: string;
  harvestDate?: string;
  quantity?: number;
  unit?: InventoryUnit;
  quality?: QualityGrade;
  status?: InventoryStatus;
  expiryDate?: string;
  storageLocation?: string;
}

export interface InventorySearchParams {
  page?: number;
  perPage?: number;
  search?: string;
  status?: InventoryStatus;
  category?: string;
  quality?: QualityGrade;
}

export interface PaginatedInventory {
  items: HarvestInventory[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

// ============================================================================
// PURCHASE ORDER TYPES
// ============================================================================

export type PurchaseOrderStatus = 'draft' | 'sent' | 'confirmed' | 'received' | 'cancelled';

export interface POItem {
  description: string;
  quantity: number;
  unitPrice?: number;
  totalPrice?: number;
}

export interface PurchaseOrder {
  purchaseOrderId: string;
  poCode: string;
  supplierId?: string;
  supplierName?: string;
  status: PurchaseOrderStatus;
  orderDate: string;
  expectedDeliveryDate?: string;
  items: POItem[];
  total?: number;
  paymentTerms?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOrderCreate {
  supplierId?: string;
  supplierName?: string;
  orderDate: string;
  expectedDeliveryDate?: string;
  items: POItem[];
  total?: number;
  paymentTerms?: string;
  notes?: string;
}

export interface PurchaseOrderUpdate {
  supplierId?: string;
  supplierName?: string;
  status?: PurchaseOrderStatus;
  orderDate?: string;
  expectedDeliveryDate?: string;
  items?: POItem[];
  total?: number;
  paymentTerms?: string;
  notes?: string;
}

export interface PurchaseOrderSearchParams {
  page?: number;
  perPage?: number;
  search?: string;
  status?: PurchaseOrderStatus;
}

export interface PaginatedPurchaseOrders {
  items: PurchaseOrder[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

// ============================================================================
// DASHBOARD TYPES
// ============================================================================

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
  lowStockItems?: HarvestInventory[];
  expiringItems?: HarvestInventory[];
  farmingYearContext?: FarmingYearContext;
}

// ============================================================================
// RETURN ORDER TYPES
// ============================================================================

export type ReturnReason = 'customer_rejected' | 'quality_issue' | 'wrong_item' | 'damaged_in_transit' | 'expired' | 'oversupply' | 'other';
export type ReturnCondition = 'resellable' | 'damaged' | 'spoiled' | 'contaminated';
export type ReturnStatus = 'pending' | 'processing' | 'completed' | 'rejected';

export interface ReturnItem {
  orderItemId: string;
  originalOrderItemProductId: string;
  productName: string;
  orderedQuantity: number;
  returnedQuantity: number;
  originalGrade: string;
  newGrade?: string;
  reason: ReturnReason;
  condition: ReturnCondition;
  inventoryId?: string;
  returnToInventory: boolean;
  notes?: string;
}

export interface ReturnOrder {
  returnId: string;
  returnCode: string;
  orderId: string;
  shipmentId?: string;
  orderCode?: string;
  customerName?: string;
  status: ReturnStatus;
  returnDate: string;
  processedDate?: string;
  items: ReturnItem[];
  totalReturnedQuantity: number;
  totalRefundAmount?: number;
  notes?: string;
  processedBy?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReturnOrderCreate {
  orderId: string;
  shipmentId?: string;
  items: Array<{
    originalOrderItemProductId: string;
    productName: string;
    orderedQuantity: number;
    returnedQuantity: number;
    originalGrade: string;
    newGrade?: string;
    reason: ReturnReason;
    condition: ReturnCondition;
    inventoryId?: string;
    returnToInventory?: boolean;
    notes?: string;
  }>;
  notes?: string;
}

export interface PaginatedReturns {
  items: ReturnOrder[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

// ============================================================================
// WASTE INVENTORY TYPES
// ============================================================================

export type WasteSourceType = 'harvest' | 'return' | 'expired' | 'damaged' | 'quality_reject' | 'other';
export type DisposalMethod = 'compost' | 'animal_feed' | 'discard' | 'sold_discount' | 'donated' | 'pending';

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
  hasInventory?: boolean;
  itemCount?: number;
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

/**
 * Response for sales inventory farming years endpoint
 */
export interface SalesInventoryFarmingYearsResponse {
  years: FarmingYearItem[];
  count: number;
  currentFarmingYear: number;
  totalItems: number;
  config: {
    startMonth: number;
    startMonthName: string;
  };
}
