/**
 * Farm Management Module - TypeScript Type Definitions
 *
 * This file contains all type definitions for the Farm Management module,
 * matching the backend API response structures.
 */

import { lightTheme } from '@a64core/shared';

const c = lightTheme.colors;

// ============================================================================
// ENUMS & CONSTANTS
// ============================================================================

export type BlockState = 'empty' | 'planned' | 'growing' | 'fruiting' | 'harvesting' | 'cleaning' | 'alert' | 'partial';

export type PlantingStatus = 'planned' | 'planted' | 'harvesting' | 'completed';

// ============================================================================
// GEO-FENCING TYPES
// ============================================================================

/**
 * GeoJSON Polygon format for geo-fencing boundaries
 * Coordinates are in [longitude, latitude] order per GeoJSON spec
 */
export interface GeoJSONPolygon {
  type: 'Polygon';
  coordinates: number[][][]; // [[[lng, lat], [lng, lat], ...]]
}

/**
 * Farm boundary with metadata for geo-fencing
 */
export interface FarmBoundary {
  geometry: GeoJSONPolygon;
  area?: number; // Square meters (auto-calculated)
  center?: {
    latitude: number;
    longitude: number;
  };
}

/**
 * Block boundary with metadata for geo-fencing
 */
export interface BlockBoundary {
  geometry: GeoJSONPolygon;
  area?: number; // Square meters (auto-calculated)
  center?: {
    latitude: number;
    longitude: number;
  };
}

// ============================================================================
// FARM TYPES
// ============================================================================

export interface FarmLocation {
  city?: string;
  state?: string;
  country?: string;
  address?: string;
  // Direct coordinates (backend model)
  latitude?: number;
  longitude?: number;
  // Nested coordinates (legacy)
  coordinates?: {
    latitude: number;
    longitude: number;
  };
}

export interface Farm {
  farmId: string;
  name: string;
  /** Human-readable farm code (e.g., "F010"). Returned by the backend, optional in API. */
  farmCode?: string | null;
  owner?: string;
  location: FarmLocation;
  totalArea: number;
  numberOfStaff?: number;
  managerId: string;
  /** Manager's display name, when populated. */
  managerName?: string | null;
  /** Manager's email, when populated. */
  managerEmail?: string | null;
  isActive: boolean;
  metadata?: Record<string, unknown>;
  boundary?: FarmBoundary; // Geo-fence polygon boundary
  createdAt: string;
  updatedAt: string;
}

export interface FarmCreate {
  name: string;
  owner?: string;
  location: FarmLocation;
  totalArea: number;
  numberOfStaff?: number;
  managerId: string;
  isActive?: boolean;
  metadata?: Record<string, unknown>;
  boundary?: FarmBoundary; // Optional geo-fence polygon
}

export interface FarmUpdate {
  name?: string;
  owner?: string;
  location?: FarmLocation;
  totalArea?: number;
  numberOfStaff?: number;
  managerId?: string;
  isActive?: boolean;
  metadata?: Record<string, unknown>;
  boundary?: FarmBoundary; // Optional geo-fence polygon
}

export interface FarmSummary {
  farmId: string;
  totalBlocks: number;
  /** Count of physical container blocks (blockCategory: 'physical'). */
  physicalBlocks?: number;
  /** Count of virtual planting blocks (blockCategory: 'virtual'). */
  virtualBlocks?: number;
  totalBlockArea: number;
  blocksByState: {
    empty: number;
    planned: number;
    growing: number;
    fruiting: number;
    harvesting: number;
    cleaning: number;
    alert: number;
  };
  activePlantings: number;
  totalPlantedPlants: number;
  predictedYield: number;
  /** Total actual harvested yield in kg across the farm. */
  actualYield?: number;
}

// ============================================================================
// BLOCK TYPES
// ============================================================================

/**
 * Snapshot of plant-library data captured when a block transitions to planted.
 * Used to show which data version the block's yield predictions are based on.
 */
export interface PlantDataSnapshot {
  plantName: string;
  yieldPerPlant: number;
  yieldUnit: string;
  expectedWastePercentage?: number | null;
  totalCycleDays: number;
}

export interface Block {
  blockId: string;
  farmId: string;
  name: string | null;
  state: BlockState;
  area?: number | null;
  areaUnit?: string;
  currentPlantingId?: string;
  metadata?: Record<string, unknown>;
  boundary?: BlockBoundary; // Geo-fence polygon boundary
  createdAt: string;
  updatedAt: string;

  // Multi-crop fields
  blockCategory?: 'physical' | 'virtual';
  parentBlockId?: string | null;
  availableArea?: number | null;
  virtualBlockCounter?: number;
  childBlockIds?: string[];
  allocatedArea?: number | null;

  // Plant data version staleness (populated by GET /farms/{farmId}/blocks/{blockId})
  plantDataVersion?: number | null;
  latestPlantDataVersion?: number | null;
  plantDataIsStale?: boolean;
  plantDataSnapshot?: PlantDataSnapshot | null;

  // Additional fields from backend
  blockCode?: string;
  legacyBlockCode?: string;
  targetCrop?: string;
  targetCropName?: string;
  actualPlantCount?: number | null;
  plantedDate?: string | null;
  expectedHarvestDate?: string | null;
  expectedStatusChanges?: Record<string, string> | null;
  statusChanges?: StatusChange[];
  kpi?: {
    predictedYieldKg: number;
    actualYieldKg: number;
    yieldEfficiencyPercent: number;
  };
}

export interface BlockCreate {
  farmId: string;
  name: string;
  blockType: string;
  area: number;
  areaUnit?: string;
  metadata?: Record<string, unknown>;
  boundary?: BlockBoundary; // Optional geo-fence polygon
}

export interface BlockUpdate {
  name?: string;
  area?: number;
  areaUnit?: string;
  metadata?: Record<string, unknown>;
  boundary?: BlockBoundary; // Optional geo-fence polygon
}

export interface BlockSummary {
  blockId: string;
  currentState: BlockState;
  utilizationPercent: number;
  currentPlantCount: number;
  currentPlanting?: {
    plantingId: string;
    plantCount: number;
    plantedDate?: string;
    estimatedHarvestDate?: string;
  };
  predictedYieldKg?: number;
  actualYieldKg?: number;
  yieldEfficiencyPercent?: number;
}

export interface StateTransition {
  newStatus: BlockState;
  notes?: string;
  targetCrop?: string; // Plant data ID (required when status=planted)
  actualPlantCount?: number; // Number of plants (when planting)
}

export interface ValidTransitionsResponse {
  currentState: BlockState;
  validTransitions: BlockState[];
}

// ============================================================================
// MULTI-CROP / VIRTUAL BLOCK TYPES
// ============================================================================

export interface AddVirtualCropRequest {
  cropId: string;
  /** Legacy field — no longer sent by the modal; backend ignores it when plantsPer100m2 is present. */
  allocatedArea?: number;
  plantCount: number;
  plantingDate?: string;
  /** Canonical density (plants per 100 m²). When present the backend DERIVES area = plantCount × 100 / plantsPer100m2. */
  plantsPer100m2?: number;
  /** Allow the virtual crop to be created even when the derived area exceeds availableArea. */
  allowOverArea?: boolean;
}

export interface EmptyVirtualBlockPreview {
  virtualBlockId: string;
  virtualBlockCode: string;
  parentBlockId: string;
  parentBlockCode: string;
  tasksToTransfer: number;
  tasksToDelete: number;
  harvestsToTransfer: number;
  areaToReturn: number;
}

export interface EmptyVirtualBlockResult {
  virtualBlockId: string;
  virtualBlockCode: string;
  parentBlockId: string;
  parentBlockCode: string;
  tasksTransferred: number;
  tasksDeleted: number;
  harvestsTransferred: number;
  areaReturned: number;
  deleted: boolean;
}

// ============================================================================
// ALERT TYPES
// ============================================================================

export type AlertStatus = 'active' | 'resolved' | 'dismissed';
export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface Alert {
  alertId: string;
  blockId: string;
  title: string;
  description: string;
  severity: AlertSeverity;
  status: AlertStatus;
  createdBy: string;
  createdByEmail: string;
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolvedByEmail?: string;
  resolutionNotes?: string;
}

export interface AlertCreate {
  blockId: string;
  title: string;
  description: string;
  severity: AlertSeverity;
}

export interface AlertResolve {
  resolutionNotes: string;
}

// ============================================================================
// HARVEST TYPES
// ============================================================================

export type QualityGrade = 'A' | 'B' | 'C';

export interface BlockHarvest {
  harvestId: string;
  blockId: string;
  harvestDate: string;
  quantityKg: number;
  qualityGrade: QualityGrade;
  notes?: string;
  recordedBy: string;
  recordedByEmail: string;
  createdAt: string;
  updatedAt: string;
  // Metadata from migration (optional)
  metadata?: {
    crop?: string;
    season?: number;
  };
}

export interface BlockHarvestCreate {
  blockId: string;
  harvestDate: string;
  quantityKg: number;
  qualityGrade: QualityGrade;
  notes?: string;
}

export interface BlockHarvestSummary {
  blockId: string;
  totalHarvests: number;
  totalQuantityKg: number;
  qualityBreakdown: {
    A: number;
    B: number;
    C: number;
  };
  averageQuality: string;
  firstHarvestDate?: string;
  lastHarvestDate?: string;
}

// ============================================================================
// BLOCK ARCHIVE TYPES
// ============================================================================

export interface QualityBreakdown {
  qualityAKg: number;
  qualityBKg: number;
  qualityCKg: number;
}

export interface AlertsSummary {
  totalAlerts: number;
  resolvedAlerts: number;
  averageResolutionTimeHours?: number;
}

export interface StatusChange {
  status: BlockState;
  changedAt: string;
  changedBy?: string;
  changedByEmail?: string;
  notes?: string;
  expectedDate?: string | null;
  offsetDays?: number | null;
  offsetType?: string | null;
}

export interface BlockArchive {
  archiveId: string;
  blockId: string;
  blockCode: string;
  farmId: string;
  farmName: string;
  blockType: string;
  maxPlants?: number | null; // Legacy field — present on old archives, absent on new ones
  actualPlantCount: number;
  area?: number;
  areaUnit: string;
  targetCrop: string;
  targetCropName: string;
  plantedDate: string;
  harvestCompletedDate: string;
  cycleDurationDays: number;
  predictedYieldKg: number;
  actualYieldKg: number;
  yieldEfficiencyPercent: number;
  totalHarvests: number;
  qualityBreakdown: QualityBreakdown;
  statusChanges: StatusChange[];
  alertsSummary: AlertsSummary;
  archivedAt: string;
  archivedBy: string;
  archivedByEmail: string;
}

export interface BlockCycleHistory {
  blockId: string;
  totalCycles: number;
  statistics?: {
    averageYieldEfficiency: number;
    averageCycleDuration: number;
    totalYieldKg: number;
    bestCycle?: {
      archiveId: string;
      cropName: string;
      yieldEfficiency: number;
      plantedDate: string;
    };
    worstCycle?: {
      archiveId: string;
      cropName: string;
      yieldEfficiency: number;
      plantedDate: string;
    };
  };
  cropsGrown?: {
    [cropName: string]: {
      count: number;
      totalYield: number;
      avgEfficiency: number;
    };
  };
  recentCycles?: Array<{
    archiveId: string;
    cropName: string;
    plantedDate: string;
    cycleDuration: number;
    yieldEfficiency: number;
    actualYieldKg: number;
  }>;
}

// ============================================================================
// PLANT DATA TYPES
// ============================================================================

export interface TemperatureRange {
  minTemp: number;
  maxTemp: number;
  optimalTemp: number;
}

export interface PlantData {
  plantDataId: string;
  name: string;
  scientificName?: string;
  plantType: string;
  growthCycleDays: number;
  expectedYield: number;
  temperatureRange: TemperatureRange;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface PlantDataCreate {
  name: string;
  scientificName?: string;
  plantType: string;
  growthCycleDays: number;
  expectedYield: number;
  temperatureRange: TemperatureRange;
  metadata?: Record<string, unknown>;
}

export interface PlantDataUpdate {
  name?: string;
  scientificName?: string;
  plantType?: string;
  growthCycleDays?: number;
  expectedYield?: number;
  temperatureRange?: TemperatureRange;
  metadata?: Record<string, unknown>;
}

export interface PlantDataSearchParams {
  search?: string;
  plantType?: string;
  page?: number;
  perPage?: number;
}

// ============================================================================
// PLANT DATA ENHANCED TYPES (13 Field Groups)
// ============================================================================

// Enums for Plant Data Enhanced
export type FarmTypeCompatibility =
  | 'open_field'
  | 'greenhouse'
  | 'hydroponic'
  | 'vertical_farm'
  | 'aquaponic'
  | 'indoor_farm'
  | 'polytunnel';

export type PlantTypeEnum =
  | 'crop'
  | 'tree'
  | 'herb'
  | 'fruit'
  | 'vegetable'
  | 'ornamental'
  | 'medicinal';

export type GrowthStage =
  | 'germination'
  | 'vegetative'
  | 'flowering'
  | 'fruiting'
  | 'harvest';

export type SeverityLevel = 'low' | 'medium' | 'high' | 'critical';

export type LightType = 'full_sun' | 'partial_shade' | 'shade' | 'artificial';

export type SoilType =
  | 'sandy'
  | 'loamy'
  | 'clay'
  | 'silt'
  | 'peat'
  | 'chalk'
  | 'hydroponic_medium';

export type WaterType = 'tap' | 'filtered' | 'ro' | 'rainwater' | 'well';

export type ToleranceLevel = 'low' | 'medium' | 'high';

export type SupportRequirement = 'none' | 'trellis' | 'stakes' | 'cage' | 'other';

// 1. Basic Information
export interface PlantDataEnhancedBasic {
  plantName: string;
  scientificName?: string;
  plantType: PlantTypeEnum;
  farmTypeCompatibility: FarmTypeCompatibility[];
  tags: string[];
}

// 2. Growth Cycle
export interface GrowthCycleInfo {
  germinationDays?: number;
  vegetativeDays?: number;
  floweringDays?: number;
  fruitingDays?: number;
  harvestDurationDays?: number;
  totalCycleDays: number;
}

// 3. Yield & Waste
export interface YieldWasteInfo {
  yieldPerPlant: number;
  yieldUnit: string;
  seedsPerPlantingPoint?: number;
  expectedWastePercentage?: number;
}

// 4. Environmental Requirements
export interface EnvironmentalRequirements {
  temperatureMin?: number;
  temperatureOptimal?: number;
  temperatureMax?: number;
  humidityMin?: number;
  humidityOptimal?: number;
  humidityMax?: number;
  co2Requirements?: number;
  airCirculation?: ToleranceLevel;
}

// 5. Watering Requirements
export interface WateringRequirements {
  wateringFrequencyDays: number;
  waterType?: WaterType;
  waterAmountPerPlant?: number;
  waterAmountUnit?: string;
  droughtTolerance?: ToleranceLevel;
}

// 8. Soil & pH Requirements
export interface SoilRequirements {
  phMin?: number;
  phOptimal?: number;
  phMax?: number;
  soilTypes?: SoilType[];
  ecMin?: number;
  ecMax?: number;
  soilNutrients?: string;
}

// 9. Diseases & Pests
export interface DiseaseOrPest {
  name: string;
  symptoms?: string;
  prevention?: string;
  treatment?: string;
  severity?: SeverityLevel;
}

// 10. Light Requirements
export interface LightRequirements {
  lightType?: LightType;
  dailyLightHoursMin?: number;
  dailyLightHoursOptimal?: number;
  dailyLightHoursMax?: number;
  lightIntensity?: number;
  photoperiodSensitive?: boolean;
}

// 11. Quality Grading
export interface QualityGradeSpec {
  gradeName: string;
  sizeRequirements?: string;
  colorRequirements?: string;
  priceMultiplier?: number;
}

// 12. Economics & Labor
export interface EconomicsAndLabor {
  averageMarketValuePerKg: number;
  currency?: string;
  totalLaborHoursPerPlant?: number;
  plantingHours?: number;
  maintenanceHours?: number;
  harvestingHours?: number;
}

// 13. Additional Information
export interface AdditionalInformation {
  growthHabit?: string;
  spacingBetweenPlantsCm?: number;
  spacingBetweenRowsCm?: number;
  supportRequirements?: SupportRequirement;
  companionPlants?: string[];
  incompatiblePlants?: string[];
  notes?: string;
}

// Fertigation Types
export type IngredientCategory = 'macro_npk' | 'potassium' | 'calcium' | 'micronutrient' | 'supplement' | 'other';

export interface FertigationIngredient {
  name: string;
  category: IngredientCategory;
  dosagePerPoint: number;
  unit: string;
}

export interface CustomApplication {
  day: number;
  ingredients: FertigationIngredient[];
  notes?: string;
}

export interface FertigationRule {
  name: string;
  type: 'interval' | 'custom';
  frequencyDays?: number;
  activeDayStart?: number;
  activeDayEnd?: number;
  ingredients?: FertigationIngredient[];
  applications?: CustomApplication[];
}

export interface FertigationCard {
  cardName: string;
  growthStage: string;
  dayStart: number;
  dayEnd: number;
  rules: FertigationRule[];
  notes?: string;
  isActive: boolean;
}

export interface FertigationSchedule {
  cards: FertigationCard[];
  totalFertilizationDays: number;
  source: string;
}

// Main Plant Data Enhanced Interface
export interface PlantDataEnhanced {
  plantDataId: string;
  dataVersion: number;

  // 1. Basic Information
  plantName: string;
  scientificName?: string;
  plantType: PlantTypeEnum;
  farmTypeCompatibility: FarmTypeCompatibility[];
  tags: string[];

  // Spacing category for auto plant count calculation
  spacingCategory?: SpacingCategory;
  // Custom density override (plants per 100 m², integer). Resolution priority: custom → category → none.
  customPlantsPer100m2?: number | null;

  // 2. Growth Cycle
  growthCycle: GrowthCycleInfo;

  // 3. Yield & Waste
  yieldInfo: YieldWasteInfo;

  // 4. Environmental Requirements
  environmentalRequirements: EnvironmentalRequirements;

  // 5. Watering Requirements
  wateringRequirements: WateringRequirements;

  // 6. Soil & pH Requirements
  soilRequirements: SoilRequirements;

  // 7. Diseases & Pests
  diseasesAndPests: DiseaseOrPest[];

  // 8. Light Requirements
  lightRequirements: LightRequirements;

  // 9. Quality Grading
  qualityGrades: QualityGradeSpec[];

  // 10. Economics & Labor
  economicsAndLabor: EconomicsAndLabor;

  // 11. Additional Information
  additionalInfo: AdditionalInformation;

  // 12. Fertigation Schedule
  fertigationSchedule?: FertigationSchedule;

  // 13. Data Attribution
  contributor?: string;   // Name of agronomist/contributor who provided this data
  targetRegion?: string;  // Geographic region where data was tested (e.g., 'UAE')

  // Audit fields
  createdByUserId: string;
  createdByEmail: string;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
}

// Create/Update DTOs
export interface PlantDataEnhancedCreate {
  // 1. Basic Information
  plantName: string;
  scientificName?: string;
  plantType: PlantTypeEnum;
  farmTypeCompatibility: FarmTypeCompatibility[];
  tags?: string[];
  spacingCategory?: SpacingCategory;
  // Custom density override (plants per 100 m², integer). Resolution priority: custom → category → none.
  customPlantsPer100m2?: number | null;

  // 2. Growth Cycle
  growthCycle: GrowthCycleInfo;

  // 3. Yield & Waste
  yieldInfo: YieldWasteInfo;

  // 4-11: Optional field groups
  environmentalRequirements?: EnvironmentalRequirements;
  wateringRequirements?: WateringRequirements;
  soilRequirements?: SoilRequirements;
  diseasesAndPests?: DiseaseOrPest[];
  lightRequirements?: LightRequirements;
  qualityGrades?: QualityGradeSpec[];
  economicsAndLabor?: EconomicsAndLabor;
  additionalInfo?: AdditionalInformation;

  // 12. Data Attribution
  contributor?: string;
  targetRegion?: string;
}

export interface PlantDataEnhancedUpdate {
  plantName?: string;
  scientificName?: string;
  // Note: plantType is NOT updatable - only set at creation
  farmTypeCompatibility?: FarmTypeCompatibility[];
  tags?: string[];
  spacingCategory?: SpacingCategory;
  // Custom density override (plants per 100 m², integer). Resolution priority: custom → category → none.
  customPlantsPer100m2?: number | null;
  growthCycle?: GrowthCycleInfo;
  yieldInfo?: YieldWasteInfo;
  environmentalRequirements?: EnvironmentalRequirements;
  wateringRequirements?: WateringRequirements;
  soilRequirements?: SoilRequirements;
  diseasesAndPests?: DiseaseOrPest[];
  lightRequirements?: LightRequirements;
  qualityGrades?: QualityGradeSpec[];
  economicsAndLabor?: EconomicsAndLabor;
  additionalInfo?: AdditionalInformation;
  // 12. Data Attribution
  contributor?: string;
  targetRegion?: string;
  // 13. Fertigation Schedule (editor modal uses this field)
  fertigationSchedule?: FertigationSchedule;
  // Note: isActive is NOT updatable - only set at creation
}

// Search Parameters
export interface PlantDataEnhancedSearchParams {
  page?: number;
  perPage?: number;
  search?: string;
  farmType?: FarmTypeCompatibility;
  minGrowthCycle?: number;
  maxGrowthCycle?: number;
  tags?: string[];
  contributor?: string;      // Filter by data contributor (e.g., 'Tayeb')
  targetRegion?: string;     // Filter by target region (e.g., 'UAE')
}

// Clone Request
export interface PlantDataCloneRequest {
  newPlantName: string;
}

// ============================================================================
// PLANTING TYPES
// ============================================================================

export interface PlantingPlanItem {
  plantDataId: string;
  quantity: number;
}

export interface Planting {
  plantingId: string;
  farmId: string;
  blockId: string;
  plants: PlantingPlanItem[];
  status: PlantingStatus;
  predictedYield: number;
  plannedDate: string;
  plantedDate?: string;
  estimatedHarvestDate?: string;
  actualHarvestDate?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface PlantingCreate {
  farmId: string;
  blockId: string;
  plants: PlantingPlanItem[];
  plannedDate: string;
  metadata?: Record<string, unknown>;
}

export interface PlantingWithDetails extends Planting {
  farmName?: string;
  blockName?: string;
  plantDetails?: Array<{
    plantDataId: string;
    name: string;
    quantity: number;
    expectedYield: number;
    growthCycleDays: number;
  }>;
  totalPlants?: number;
}

export interface MarkPlantedRequest {
  plantedDate: string;
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

export interface ApiError {
  message: string;
  detail?: string;
  code?: string;
}

export interface ApiResponse<T> {
  data?: T;
  error?: ApiError;
  message?: string;
}

// ============================================================================
// UI STATE TYPES
// ============================================================================

export interface FarmFilters {
  search?: string;
  isActive?: boolean;
  page: number;
  perPage: number;
}

export interface BlockFilters {
  state?: BlockState;
  search?: string;
}

export interface PlantingFilters {
  farmId?: string;
  status?: PlantingStatus;
  search?: string;
  page: number;
  perPage: number;
}

// ============================================================================
// MANAGER TYPES
// ============================================================================

export interface Manager {
  userId: string;
  name: string;
  email: string;
  role: string;
}

export interface ManagersResponse {
  data: {
    managers: Manager[];
  };
  message: string;
}

// ============================================================================
// FORM TYPES
// ============================================================================

export interface CreateFarmFormData {
  name: string;
  owner?: string;
  state: string;
  country: string;
  totalArea: number;
  numberOfStaff?: number;
  managerId: string;
  isActive: boolean;
}

export interface CreateBlockFormData {
  name: string;
  area: number;
}

export interface CreatePlantingFormData {
  farmId: string;
  blockId: string;
  plannedDate: string;
  plants: Array<{
    plantDataId: string;
    quantity: number;
  }>;
}

export interface CreatePlantDataFormData {
  name: string;
  scientificName?: string;
  plantType: string;
  growthCycleDays: number;
  expectedYield: number;
  minTemp: number;
  maxTemp: number;
  optimalTemp: number;
}

// ============================================================================
// DASHBOARD TYPES
// ============================================================================

export interface DashboardMetrics {
  totalFarms: number;
  totalBlocks: number;
  blocksByState: {
    empty: number;
    planned: number;
    growing: number;
    fruiting: number;
    harvesting: number;
    cleaning: number;
    alert: number;
  };
  activePlantings: number;
  upcomingHarvests: number;
}

export interface RecentActivity {
  id: string;
  type: 'planting_created' | 'planting_planted' | 'block_state_change' | 'farm_created';
  farmName: string;
  blockName?: string;
  description: string;
  timestamp: string;
}

// ============================================================================
// CSV IMPORT TYPES
// ============================================================================

export interface CSVImportResult {
  success: boolean;
  imported: number;
  failed: number;
  errors?: Array<{
    row: number;
    message: string;
  }>;
}

// ============================================================================
// COLOR CONSTANTS (Block State Colors)
// ============================================================================

// Kept in sync with BLOCK_POLYGON_COLORS in src/config/mapConfig.ts — same
// lifecycle states, same hex, across badges/legends and the map overlay.
export const BLOCK_STATE_COLORS: Record<BlockState, string> = {
  empty: c.neutral[400],       // was gray
  planned: c.primary[500],     // lapis (was blue)
  growing: c.emerald[500],     // (was green)
  fruiting: c.gold[400],       // was purple — categorical judgement call, spec §3
  harvesting: c.gold[500],     // warning (was amber)
  cleaning: c.terracotta[400], // (was orange)
  alert: c.terracotta[600],    // deepened — danger carries weight, spec §1 (was red)
  partial: c.primary[400],     // was cyan — art-only hue, spec §3
};

export const BLOCK_STATE_LABELS: Record<BlockState, string> = {
  empty: 'Empty',
  planned: 'Planned',
  growing: 'Growing',
  fruiting: 'Fruiting',
  harvesting: 'Harvesting',
  cleaning: 'Cleaning',
  alert: 'Alert',
  partial: 'Partial',
};

export const PLANTING_STATUS_COLORS: Record<PlantingStatus, string> = {
  planned: c.primary[500], // lapis (was blue)
  planted: c.success,      // emerald (was green)
  harvesting: c.warning,   // gold (was amber)
  completed: c.textSecondary, // (was gray)
};

export const PLANTING_STATUS_LABELS: Record<PlantingStatus, string> = {
  planned: 'Planned',
  planted: 'Planted',
  harvesting: 'Harvesting',
  completed: 'Completed',
};

// ============================================================================
// DASHBOARD TYPES
// ============================================================================

export type DashboardBlockStatus =
  | 'empty'
  | 'planned'
  | 'growing'
  | 'fruiting'
  | 'harvesting'
  | 'cleaning';

export type PerformanceCategory =
  | 'exceptional'  // >= 200%
  | 'exceeding'    // 100-199%
  | 'excellent'    // 90-99%
  | 'good'         // 70-89%
  | 'acceptable'   // 50-69%
  | 'poor';        // < 50%

export interface BlockCalculated {
  // Timeliness tracking
  daysInCurrentState: number;
  expectedStateChangeDate: string | null;
  daysUntilNextTransition: number | null;
  isDelayed: boolean;
  delayDays: number;

  // Capacity
  capacityPercent: number;

  // Yield performance (for harvesting state)
  yieldProgress: number;
  yieldStatus: 'on_track' | 'ahead' | 'behind';
  estimatedFinalYield: number;
  performanceCategory: PerformanceCategory;

  // Next action
  nextAction: string;
  nextActionDate: string | null;
}

export interface DashboardAlert {
  alertId: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  createdAt: string;
}

export interface DashboardBlock {
  // Core block data
  blockId: string;
  blockCode: string;
  name: string | null;
  state: DashboardBlockStatus;
  blockType: string | null;

  // Planting info
  targetCrop: string | null;
  targetCropName: string | null;
  actualPlantCount: number | null;
  maxPlants?: number | null; // Legacy field — kept optional for historical dashboard data

  // Dates
  plantedDate: string | null;
  expectedHarvestDate: string | null;
  expectedStatusChanges: Record<string, string> | null;

  // Status History (actual state change dates)
  statusChanges?: StatusChange[];

  // KPI
  kpi: {
    predictedYieldKg: number;
    actualYieldKg: number;
    yieldEfficiencyPercent: number;
    totalHarvests: number;
  };

  // Calculated metrics
  calculated: BlockCalculated;

  // Block hierarchy
  blockCategory?: 'physical' | 'virtual' | null;
  parentBlockId?: string | null;

  // Active alerts
  activeAlerts: DashboardAlert[];
}

export interface FarmInfo {
  farmId: string;
  name: string;
  code: string;
  totalArea: number | null;
  areaUnit: string;
  managerName: string | null;
  managerEmail: string | null;
}

export interface DashboardSummary {
  totalBlocks: number;
  /** Count of physical container blocks (blockCategory: 'physical'). */
  physicalBlocks?: number;
  /** Count of virtual planting blocks (blockCategory: 'virtual'). */
  virtualBlocks?: number;
  blocksByState: Record<string, number>;
  totalActivePlantings: number;
  totalPredictedYieldKg: number;
  totalActualYieldKg: number;
  avgYieldEfficiency: number;
  activeAlerts: Record<string, number>;
}

export interface DashboardActivity {
  blockId: string;
  blockCode: string;
  action: 'state_change' | 'harvest_recorded' | 'alert_created' | 'alert_resolved';
  details: string;
  timestamp: string;
}

export interface UpcomingEvent {
  blockId: string;
  blockCode: string;
  eventType: 'expected_harvest' | 'expected_planting' | 'expected_transition' | 'overdue_transition';
  eventDate: string;
  daysUntil: number;
}

export interface DashboardData {
  farmInfo: FarmInfo;
  summary: DashboardSummary;
  blocks: DashboardBlock[];
  recentActivity: DashboardActivity[];
  upcomingEvents: UpcomingEvent[];
}

export interface QuickTransitionRequest {
  newState: DashboardBlockStatus;
  notes?: string;
  targetCrop?: string;
  actualPlantCount?: number;
  force?: boolean;
}

export interface QuickHarvestRequest {
  quantityKg: number;
  qualityGrade: 'A' | 'B' | 'C';
  notes?: string;
}

// ============================================================================
// SPACING STANDARDS TYPES
// ============================================================================

export type SpacingCategory =
  | 'xs'           // Extra Small - microgreens, herbs
  | 's'            // Small - lettuce, spinach
  | 'm'            // Medium - peppers, beans
  | 'l'            // Large - tomatoes, eggplant
  | 'xl'           // Extra Large - squash, melons
  | 'bush'         // Bush - blueberries
  | 'large_bush'   // Large Bush
  | 'small_tree'   // Small Tree - citrus
  | 'medium_tree'  // Medium Tree - apple, mango
  | 'large_tree';  // Large Tree - date palm, coconut

export interface SpacingCategoryInfo {
  value: SpacingCategory;
  name: string;
  description: string;
  currentDensity: number;  // plants per 100 m²
  defaultDensity: number;
  isModified: boolean;
}

export interface SpacingStandardsConfig {
  configId: string;
  configType: string;
  densities: Record<SpacingCategory, number>;
  updatedAt: string;
  updatedBy?: string;
  updatedByEmail?: string;
}

export interface SpacingStandardsUpdate {
  densities: Record<SpacingCategory, number>;
}

export interface SpacingStandardsResponse {
  data: SpacingStandardsConfig;
  message?: string;
}

export interface SpacingCategoriesResponse {
  categories: SpacingCategoryInfo[];
  lastUpdated: string | null;
  updatedBy: string | null;
}

export interface CalculatePlantsResponse {
  plantCount: number;
  area: number;
  areaUnit: string;
  areaSqm: number;
  spacingCategory: SpacingCategory;
  plantsPerHundredSqm: number;
  calculation: string;
}

// Spacing category labels for display
export const SPACING_CATEGORY_LABELS: Record<SpacingCategory, string> = {
  xs: 'Extra Small',
  s: 'Small',
  m: 'Medium',
  l: 'Large',
  xl: 'Extra Large',
  bush: 'Bush',
  large_bush: 'Large Bush',
  small_tree: 'Small Tree',
  medium_tree: 'Medium Tree',
  large_tree: 'Large Tree',
};

// Example plants for each category
export const SPACING_CATEGORY_EXAMPLES: Record<SpacingCategory, string> = {
  xs: 'Microgreens, herbs',
  s: 'Lettuce, spinach',
  m: 'Peppers, beans',
  l: 'Tomatoes, eggplant',
  xl: 'Squash, melons',
  bush: 'Blueberries',
  large_bush: 'Large fruiting bushes',
  small_tree: 'Citrus, dwarf fruit trees',
  medium_tree: 'Apple, mango',
  large_tree: 'Date palm, coconut',
};

// ============================================================================
// WEATHER & AGRICULTURAL DATA TYPES
// ============================================================================

/**
 * Soil conditions at various depths
 */
export interface SoilConditions {
  temp_0_10cm?: number;
  temp_10_40cm?: number;
  temp_40_100cm?: number;
  temp_100_200cm?: number;
  moisture_0_10cm?: number;
  moisture_10_40cm?: number;
  moisture_40_100cm?: number;
  moisture_100_200cm?: number;
}

/**
 * Solar and light conditions
 */
export interface SolarData {
  // Current solar radiation
  solarRadiation?: number;   // W/m²
  uvIndex?: number;          // 0-11+

  // Irradiance components
  ghi?: number;              // Global Horizontal Irradiance (W/m²)
  dni?: number;              // Direct Normal Irradiance (W/m²)
  dhi?: number;              // Diffuse Horizontal Irradiance (W/m²)

  // Sun position
  sunElevation?: number;     // degrees
  sunAzimuth?: number;       // degrees (hour angle)

  // Sunrise/Sunset
  sunrise?: string;          // local time
  sunset?: string;           // local time

  // Downward radiation (from ag-weather)
  dswrfAvg?: number;         // Downward shortwave radiation avg (W/m²)
  dswrfMax?: number;         // Downward shortwave radiation max (W/m²)
  dlwrfAvg?: number;         // Downward longwave radiation avg (W/m²)
  dlwrfMax?: number;         // Downward longwave radiation max (W/m²)
}

/**
 * Air quality data
 */
export interface AirQuality {
  // Air Quality Index (EPA standard 0-500)
  aqi?: number;
  aqiCategory?: string;      // Good, Moderate, Unhealthy, etc.

  // Pollutants (µg/m³)
  pm25?: number;             // PM2.5
  pm10?: number;             // PM10
  o3?: number;               // Ozone
  no2?: number;              // Nitrogen dioxide
  so2?: number;              // Sulfur dioxide
  co?: number;               // Carbon monoxide

  // Pollen levels (0=None, 1=Low, 2=Moderate, 3=High, 4=Very High)
  pollenTree?: number;
  pollenGrass?: number;
  pollenWeed?: number;
  moldLevel?: number;
  predominantPollen?: string;
}

/**
 * AQI category type
 */
export type AQICategory = 'Good' | 'Moderate' | 'Unhealthy for Sensitive Groups' | 'Unhealthy' | 'Very Unhealthy' | 'Hazardous';

/**
 * AQI category colors for UI
 */
// Sequential severity scale — depth within the terracotta ramp carries the
// worsening danger for the two most severe tiers (was a purple/maroon jump
// in the old EPA-style palette; the brand ramp only has terracotta for
// "danger", so severity is expressed as depth instead, spec §1/§3).
export const AQI_CATEGORY_COLORS: Record<string, string> = {
  'Good': c.success,                              // emerald (was green)
  'Moderate': c.warning,                          // gold (was amber)
  'Unhealthy for Sensitive Groups': c.terracotta[400], // (was orange)
  'Unhealthy': c.error,                           // terracotta (was red)
  'Very Unhealthy': c.terracotta[700],            // deeper terracotta (was purple)
  'Hazardous': c.terracotta[900],                 // deepest terracotta (was dark red)
};

/**
 * Pollen level labels
 */
export const POLLEN_LEVEL_LABELS: Record<number, string> = {
  0: 'None',
  1: 'Low',
  2: 'Moderate',
  3: 'High',
  4: 'Very High',
};

/**
 * Current weather conditions
 */
export interface CurrentWeather {
  latitude: number;
  longitude: number;
  city?: string;
  country?: string;
  timezone?: string;
  observedAt: string;
  temperature: number;
  feelsLike?: number;
  description: string;
  icon?: string;
  cloudCover?: number;
  precipitation?: number;
  precipitationProbability?: number;
  humidity?: number;
  pressure?: number;
  dewPoint?: number;
  visibility?: number;
  windSpeed?: number;
  windDirection?: number;
  windDirectionText?: string;
  gustSpeed?: number;
  uvIndex?: number;
  solarRadiation?: number;
  airQualityIndex?: number;
}

/**
 * Single day agricultural weather forecast
 */
export interface AgriWeatherForecastDay {
  date: string;
  tempHigh?: number;
  tempLow?: number;
  tempAvg?: number;
  precipitation?: number;
  precipitationProbability?: number;
  humidity?: number;
  windSpeed?: number;
  evapotranspiration?: number;
  soil?: SoilConditions;
  solarRadiationAvg?: number;
  solarRadiationMax?: number;
  description?: string;
  icon?: string;
}

/**
 * Multi-day agricultural weather forecast
 */
export interface AgriWeatherForecast {
  latitude: number;
  longitude: number;
  generatedAt: string;
  days: AgriWeatherForecastDay[];
}

/**
 * Risk level type for agricultural insights
 */
export type RiskLevel = 'none' | 'low' | 'medium' | 'high';

/**
 * Growing conditions assessment
 */
export type GrowingConditions = 'excellent' | 'good' | 'fair' | 'poor' | 'unknown';

/**
 * Agricultural insights and recommendations
 */
export interface AgriculturalInsights {
  growingConditions: GrowingConditions;
  frostRisk: RiskLevel;
  droughtRisk: RiskLevel;
  floodRisk: RiskLevel;
  heatStressRisk: RiskLevel;
  soilWorkability: string;
  irrigationNeed: string;
  recommendations: string[];
  alerts: string[];
}

/**
 * Complete agricultural weather data for a farm
 */
export interface AgriWeatherData {
  farmId: string;
  farmName: string;
  latitude: number;
  longitude: number;
  current?: CurrentWeather;
  soil?: SoilConditions;
  solar?: SolarData;
  airQuality?: AirQuality;
  forecast?: AgriWeatherForecast;
  insights?: AgriculturalInsights;
  dataSource: string;
  lastUpdated: string;
  hasCurrentWeather: boolean;
  hasSoilData: boolean;
  hasSolarData: boolean;
  hasAirQuality: boolean;
  hasForecast: boolean;
}

// Risk level colors for UI
export const RISK_LEVEL_COLORS: Record<RiskLevel, string> = {
  none: c.success,      // emerald (was green)
  low: c.emerald[300],  // lighter emerald (was lime)
  medium: c.warning,    // gold (was amber)
  high: c.error,        // terracotta (was red)
};

export const RISK_LEVEL_LABELS: Record<RiskLevel, string> = {
  none: 'None',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

// Growing conditions colors
export const GROWING_CONDITIONS_COLORS: Record<GrowingConditions, string> = {
  excellent: c.success,      // emerald (was green)
  good: c.emerald[300],      // lighter emerald (was lime)
  fair: c.warning,           // gold (was amber)
  poor: c.error,             // terracotta (was red)
  unknown: c.textSecondary,  // (was gray)
};

export const GROWING_CONDITIONS_LABELS: Record<GrowingConditions, string> = {
  excellent: 'Excellent',
  good: 'Good',
  fair: 'Fair',
  poor: 'Poor',
  unknown: 'Unknown',
};

// ============================================================================
// SENSEHUB IOT TYPES
// ============================================================================

export interface SenseHubConnectionStatus {
  connected: boolean;
  connectionStatus: 'connected' | 'disconnected' | 'error' | 'unknown';
  lastConnected: string | null;
  lastSyncedAt: string | null;
  senseHubVersion: string | null;
  address?: string;
  port?: number;
  mcpPort?: number;
  mcpApiKey?: string;
}

export interface SenseHubEquipment {
  id: number;
  name: string;
  description?: string;
  type: 'sensor' | 'relay';
  protocol?: string;
  address?: string;
  status: 'online' | 'offline' | 'error';
  enabled: boolean | number;
  last_reading: string | Record<string, unknown> | null;
  last_communication: string | null;
  register_mappings: Array<{
    name: string;
    label?: string;
    register: string | number;
    type: string;
    access?: string;
    unit?: string;
    dataType?: string;
    scale?: number;
    functionCode?: number;
  }>;
  write_only: boolean | number;
}

export interface SenseHubAutomation {
  id: number;
  name: string;
  description: string;
  enabled: boolean;
  priority: number;
  trigger_config: Record<string, unknown>;
  conditions: unknown[];
  actions: unknown[];
  last_run: string | null;
  run_count: number;
}

export interface SenseHubAlert {
  id: number;
  equipment_id: number;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  acknowledged: boolean;
  equipment_name: string;
  zone_name: string;
  created_at: string;
}

export interface SenseHubDashboard {
  equipment: { total: number; online: number; offline: number; error: number };
  automations: { total: number; active: number };
  alerts: { unacknowledged: number; critical: number; warning: number; info: number };
  recent_alerts: SenseHubAlert[];
  latest_readings: unknown[];
  active_automations: SenseHubAutomation[];
  equipment_list: SenseHubEquipment[];
}

export interface SenseHubLabReading {
  id: number;
  sample_date: string;
  nutrient: string;
  value: number;
  unit: string;
  zone_id: string;
  zone_name: string;
  notes?: string;
  created_at: string;
  updated_at?: string;
}

export interface SenseHubLabReadingsResponse {
  readings: SenseHubLabReading[];
  total: number;
  limit: number;
  offset: number;
}

export interface SenseHubLabStat {
  nutrient: string;
  avg: number;
  min: number;
  max: number;
  count: number;
  unit: string;
}
