/**
 * Farm Management Module - TypeScript Type Definitions
 *
 * This file contains all type definitions for the Farm Management module,
 * matching the backend API response structures.
 */

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
  owner?: string;
  location: FarmLocation;
  totalArea: number;
  numberOfStaff?: number;
  managerId: string;
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
}

// ============================================================================
// BLOCK TYPES
// ============================================================================

export interface Block {
  blockId: string;
  farmId: string;
  name: string | null;
  state: BlockState;
  area?: number | null;
  areaUnit?: string;
  maxPlants: number;
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
  maxPlants: number;
  metadata?: Record<string, unknown>;
  boundary?: BlockBoundary; // Optional geo-fence polygon
}

export interface BlockUpdate {
  name?: string;
  area?: number;
  areaUnit?: string;
  maxPlants?: number;
  metadata?: Record<string, unknown>;
  boundary?: BlockBoundary; // Optional geo-fence polygon
}

export interface BlockSummary {
  blockId: string;
  currentState: BlockState;
  utilizationPercent: number;
  currentPlantCount: number;
  maxPlants: number;
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
  allocatedArea: number;
  plantCount: number;
  plantingDate?: string;
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
  maxPlants: number;
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
export interface QualityGrade {
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
  qualityGrades: QualityGrade[];

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
  qualityGrades?: QualityGrade[];
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
  growthCycle?: GrowthCycleInfo;
  yieldInfo?: YieldWasteInfo;
  environmentalRequirements?: EnvironmentalRequirements;
  wateringRequirements?: WateringRequirements;
  soilRequirements?: SoilRequirements;
  diseasesAndPests?: DiseaseOrPest[];
  lightRequirements?: LightRequirements;
  qualityGrades?: QualityGrade[];
  economicsAndLabor?: EconomicsAndLabor;
  additionalInfo?: AdditionalInformation;
  // 12. Data Attribution
  contributor?: string;
  targetRegion?: string;
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
  city: string;
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
  maxPlants: number;
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

export const BLOCK_STATE_COLORS: Record<BlockState, string> = {
  empty: '#6B7280',      // Gray
  planned: '#3B82F6',    // Blue
  growing: '#10B981',    // Green
  fruiting: '#A855F7',   // Purple
  harvesting: '#F59E0B', // Yellow/Orange
  cleaning: '#F97316',   // Orange
  alert: '#EF4444',      // Red
  partial: '#06B6D4',    // Cyan
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
  planned: '#3B82F6',    // Blue
  planted: '#10B981',    // Green
  harvesting: '#F59E0B', // Yellow/Orange
  completed: '#6B7280',  // Gray
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
  maxPlants: number;

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
export const AQI_CATEGORY_COLORS: Record<string, string> = {
  'Good': '#10B981',                           // Green
  'Moderate': '#F59E0B',                       // Amber
  'Unhealthy for Sensitive Groups': '#F97316', // Orange
  'Unhealthy': '#EF4444',                      // Red
  'Very Unhealthy': '#7C3AED',                 // Purple
  'Hazardous': '#7F1D1D',                      // Dark Red
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
  none: '#10B981',    // Green
  low: '#84CC16',     // Lime
  medium: '#F59E0B',  // Amber
  high: '#EF4444',    // Red
};

export const RISK_LEVEL_LABELS: Record<RiskLevel, string> = {
  none: 'None',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

// Growing conditions colors
export const GROWING_CONDITIONS_COLORS: Record<GrowingConditions, string> = {
  excellent: '#10B981',  // Green
  good: '#84CC16',       // Lime
  fair: '#F59E0B',       // Amber
  poor: '#EF4444',       // Red
  unknown: '#6B7280',    // Gray
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
