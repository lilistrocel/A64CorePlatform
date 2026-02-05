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

// Base units for automated calculations
export type BaseUnit = 'mg' | 'ml' | 'unit';

// Display units for user-friendly input
export type DisplayUnit =
  // Mass units (convert to mg)
  | 'kg' | 'g' | 'mg' | 'lb' | 'oz'
  // Volume units (convert to ml)
  | 'L' | 'ml' | 'gal'
  // Countable units
  | 'unit' | 'piece' | 'packet' | 'bag' | 'box';

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

  // Quantity (display units - what user sees)
  quantity: number;
  unit: string;
  minimumStock: number;
  isLowStock: boolean;

  // Base unit tracking (for automated calculations)
  baseUnit: BaseUnit;
  baseQuantity: number;
  baseMinimumStock: number;

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
  wasteInventory: {
    totalItems: number;
    pendingDisposal: number;
  };
  totalHarvestValue: number;
  totalInputValue: number;
  totalAssetValue: number;
  totalWasteValue: number;
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

// ============================================================================
// UNIT CONFIGURATION
// ============================================================================

// Map category to base unit
export const CATEGORY_BASE_UNIT: Record<InputCategory, BaseUnit> = {
  fertilizer: 'mg',
  pesticide: 'ml',
  herbicide: 'ml',
  fungicide: 'ml',
  seed: 'unit',
  seedling: 'unit',
  soil: 'mg',
  substrate: 'mg',
  nutrient_solution: 'ml',
  growth_regulator: 'ml',
  packaging: 'unit',
  other: 'unit',
};

// Display unit options per base unit type
export interface UnitOption {
  value: DisplayUnit;
  label: string;
}

export const MASS_UNITS: UnitOption[] = [
  { value: 'kg', label: 'Kilograms (kg)' },
  { value: 'g', label: 'Grams (g)' },
  { value: 'mg', label: 'Milligrams (mg)' },
  { value: 'lb', label: 'Pounds (lb)' },
  { value: 'oz', label: 'Ounces (oz)' },
];

export const VOLUME_UNITS: UnitOption[] = [
  { value: 'L', label: 'Liters (L)' },
  { value: 'ml', label: 'Milliliters (ml)' },
  { value: 'gal', label: 'Gallons (gal)' },
];

export const COUNT_UNITS: UnitOption[] = [
  { value: 'unit', label: 'Units' },
  { value: 'piece', label: 'Pieces' },
  { value: 'packet', label: 'Packets' },
  { value: 'bag', label: 'Bags' },
  { value: 'box', label: 'Boxes' },
];

// Get available units for a category
export function getUnitsForCategory(category: InputCategory): UnitOption[] {
  const baseUnit = CATEGORY_BASE_UNIT[category];
  switch (baseUnit) {
    case 'mg':
      return MASS_UNITS;
    case 'ml':
      return VOLUME_UNITS;
    case 'unit':
      return COUNT_UNITS;
    default:
      return COUNT_UNITS;
  }
}

// Get default unit for a category
export function getDefaultUnitForCategory(category: InputCategory): DisplayUnit {
  const baseUnit = CATEGORY_BASE_UNIT[category];
  switch (baseUnit) {
    case 'mg':
      return 'kg';  // Default to kg for mass
    case 'ml':
      return 'L';   // Default to liters for volume
    case 'unit':
      return 'unit';
    default:
      return 'unit';
  }
}
