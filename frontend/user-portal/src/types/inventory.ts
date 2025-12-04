/**
 * Inventory Types
 *
 * Type definitions for the inventory management system:
 * - Harvest Inventory (harvested plants for sale)
 * - Input Inventory (fertilizers, pesticides, seeds, etc.)
 * - Asset Inventory (tractors, machinery, infrastructure)
 */

// ============================================================================
// ENUMS
// ============================================================================

export type InventoryType = 'harvest' | 'input' | 'asset';

export type HarvestProductType = 'fresh' | 'processed' | 'dried' | 'frozen' | 'packaged';

export type InputCategory =
  | 'fertilizer'
  | 'pesticide'
  | 'herbicide'
  | 'fungicide'
  | 'seed'
  | 'seedling'
  | 'soil'
  | 'substrate'
  | 'nutrient_solution'
  | 'growth_regulator'
  | 'packaging'
  | 'other';

export type AssetCategory =
  | 'tractor'
  | 'harvester'
  | 'irrigation_system'
  | 'greenhouse'
  | 'storage_facility'
  | 'vehicle'
  | 'tool'
  | 'equipment'
  | 'infrastructure'
  | 'sensor'
  | 'other';

export type AssetStatus =
  | 'operational'
  | 'maintenance'
  | 'repair'
  | 'decommissioned'
  | 'stored';

export type QualityGrade =
  | 'premium'
  | 'grade_a'
  | 'grade_b'
  | 'grade_c'
  | 'processing'
  | 'rejected';

export type MovementType =
  | 'addition'
  | 'removal'
  | 'adjustment'
  | 'transfer'
  | 'sale'
  | 'waste'
  | 'usage'
  | 'return';

// ============================================================================
// HARVEST INVENTORY
// ============================================================================

export interface HarvestInventory {
  inventoryId: string;
  farmId: string;
  blockId?: string;

  // Product identification
  plantDataId: string;
  plantName: string;
  productType: HarvestProductType;
  variety?: string;

  // Quantity
  quantity: number;
  unit: string;
  reservedQuantity: number;
  availableQuantity: number;

  // Quality
  qualityGrade: QualityGrade;

  // Dates
  harvestDate: string;
  expiryDate?: string;

  // Storage
  storageLocation?: string;
  storageConditions?: string;

  // Pricing
  unitPrice?: number;
  currency: string;

  // Notes
  notes?: string;

  // Source tracking (links to block harvest if auto-created)
  sourceHarvestId?: string;

  // Tracking
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface HarvestInventoryCreate {
  farmId: string;
  blockId?: string;
  plantDataId: string;
  plantName: string;
  productType: HarvestProductType;
  variety?: string;
  quantity: number;
  unit: string;
  qualityGrade: QualityGrade;
  harvestDate: string;
  expiryDate?: string;
  storageLocation?: string;
  storageConditions?: string;
  unitPrice?: number;
  currency?: string;
  notes?: string;
}

export interface HarvestInventoryUpdate {
  quantity?: number;
  qualityGrade?: QualityGrade;
  expiryDate?: string;
  storageLocation?: string;
  storageConditions?: string;
  unitPrice?: number;
  currency?: string;
  notes?: string;
}

// ============================================================================
// INPUT INVENTORY
// ============================================================================

export interface InputInventory {
  inventoryId: string;
  farmId: string;

  // Item identification
  itemName: string;
  category: InputCategory;
  brand?: string;
  sku?: string;

  // Quantity
  quantity: number;
  unit: string;
  minimumStock: number;
  isLowStock: boolean;

  // Dates
  purchaseDate?: string;
  expiryDate?: string;

  // Storage
  storageLocation?: string;

  // Cost
  unitCost?: number;
  currency: string;
  supplier?: string;

  // Specifications
  activeIngredients?: string;
  concentration?: string;
  applicationRate?: string;
  safetyNotes?: string;

  // Notes
  notes?: string;

  // Tracking
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
}

export interface InputInventoryCreate {
  farmId: string;
  itemName: string;
  category: InputCategory;
  brand?: string;
  sku?: string;
  quantity: number;
  unit: string;
  minimumStock?: number;
  purchaseDate?: string;
  expiryDate?: string;
  storageLocation?: string;
  unitCost?: number;
  currency?: string;
  supplier?: string;
  activeIngredients?: string;
  concentration?: string;
  applicationRate?: string;
  safetyNotes?: string;
  notes?: string;
}

export interface InputInventoryUpdate {
  itemName?: string;
  brand?: string;
  quantity?: number;
  minimumStock?: number;
  expiryDate?: string;
  storageLocation?: string;
  unitCost?: number;
  currency?: string;
  supplier?: string;
  notes?: string;
}

// ============================================================================
// ASSET INVENTORY
// ============================================================================

export interface AssetInventory {
  inventoryId: string;
  farmId: string;

  // Asset identification
  assetName: string;
  category: AssetCategory;
  assetTag?: string;
  serialNumber?: string;

  // Details
  brand?: string;
  model?: string;
  year?: number;

  // Status
  status: AssetStatus;
  condition?: string;

  // Location
  location?: string;
  assignedTo?: string;

  // Financial
  purchaseDate?: string;
  purchasePrice?: number;
  currentValue?: number;
  currency: string;

  // Maintenance
  lastMaintenanceDate?: string;
  nextMaintenanceDate?: string;
  maintenanceNotes?: string;
  maintenanceOverdue: boolean;

  // Specifications
  specifications?: string;

  // Documentation
  warrantyExpiry?: string;
  documentationUrl?: string;

  // Notes
  notes?: string;

  // Tracking
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AssetInventoryCreate {
  farmId: string;
  assetName: string;
  category: AssetCategory;
  assetTag?: string;
  serialNumber?: string;
  brand?: string;
  model?: string;
  year?: number;
  status?: AssetStatus;
  condition?: string;
  location?: string;
  assignedTo?: string;
  purchaseDate?: string;
  purchasePrice?: number;
  currentValue?: number;
  currency?: string;
  lastMaintenanceDate?: string;
  nextMaintenanceDate?: string;
  maintenanceNotes?: string;
  specifications?: string;
  warrantyExpiry?: string;
  documentationUrl?: string;
  notes?: string;
}

export interface AssetInventoryUpdate {
  assetName?: string;
  status?: AssetStatus;
  condition?: string;
  location?: string;
  assignedTo?: string;
  currentValue?: number;
  lastMaintenanceDate?: string;
  nextMaintenanceDate?: string;
  maintenanceNotes?: string;
  notes?: string;
}

// ============================================================================
// INVENTORY MOVEMENT
// ============================================================================

export interface InventoryMovement {
  movementId: string;
  inventoryId: string;
  inventoryType: InventoryType;
  movementType: MovementType;
  quantityBefore: number;
  quantityChange: number;
  quantityAfter: number;
  reason?: string;
  referenceId?: string;
  performedBy: string;
  performedAt: string;
}

// ============================================================================
// SUMMARY & DASHBOARD
// ============================================================================

export interface InventorySummary {
  harvestInventory: {
    totalItems: number;
    totalQuantity: number;
  };
  inputInventory: {
    totalItems: number;
    lowStockItems: number;
  };
  assetInventory: {
    totalItems: number;
    operationalCount: number;
  };
  totalHarvestValue: number;
  totalInputValue: number;
  totalAssetValue: number;
  lowStockAlerts: number;
  expiringItems: number;
  maintenanceOverdue: number;
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

export interface CategoryOption {
  value: string;
  label: string;
}

// ============================================================================
// DISPLAY HELPERS
// ============================================================================

export const INPUT_CATEGORY_LABELS: Record<InputCategory, string> = {
  fertilizer: 'Fertilizer',
  pesticide: 'Pesticide',
  herbicide: 'Herbicide',
  fungicide: 'Fungicide',
  seed: 'Seed',
  seedling: 'Seedling',
  soil: 'Soil',
  substrate: 'Substrate',
  nutrient_solution: 'Nutrient Solution',
  growth_regulator: 'Growth Regulator',
  packaging: 'Packaging',
  other: 'Other',
};

export const ASSET_CATEGORY_LABELS: Record<AssetCategory, string> = {
  tractor: 'Tractor',
  harvester: 'Harvester',
  irrigation_system: 'Irrigation System',
  greenhouse: 'Greenhouse',
  storage_facility: 'Storage Facility',
  vehicle: 'Vehicle',
  tool: 'Tool',
  equipment: 'Equipment',
  infrastructure: 'Infrastructure',
  sensor: 'Sensor',
  other: 'Other',
};

export const ASSET_STATUS_LABELS: Record<AssetStatus, string> = {
  operational: 'Operational',
  maintenance: 'Maintenance',
  repair: 'Repair',
  decommissioned: 'Decommissioned',
  stored: 'Stored',
};

export const QUALITY_GRADE_LABELS: Record<QualityGrade, string> = {
  premium: 'Premium',
  grade_a: 'Grade A',
  grade_b: 'Grade B',
  grade_c: 'Grade C',
  processing: 'Processing',
  rejected: 'Rejected',
};

export const PRODUCT_TYPE_LABELS: Record<HarvestProductType, string> = {
  fresh: 'Fresh',
  processed: 'Processed',
  dried: 'Dried',
  frozen: 'Frozen',
  packaged: 'Packaged',
};
