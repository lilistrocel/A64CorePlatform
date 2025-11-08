/**
 * Farm Management Module - TypeScript Type Definitions
 *
 * This file contains all type definitions for the Farm Management module,
 * matching the backend API response structures.
 */

// ============================================================================
// ENUMS & CONSTANTS
// ============================================================================

export type BlockState = 'empty' | 'planned' | 'planted' | 'harvesting' | 'alert';

export type PlantingStatus = 'planned' | 'planted' | 'harvesting' | 'completed';

// ============================================================================
// FARM TYPES
// ============================================================================

export interface FarmLocation {
  city: string;
  state: string;
  country: string;
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
}

export interface FarmSummary {
  farmId: string;
  totalBlocks: number;
  totalBlockArea: number;
  blocksByState: {
    empty: number;
    planned: number;
    planted: number;
    harvesting: number;
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
  name: string;
  state: BlockState;
  area: number;
  maxPlants: number;
  currentPlantingId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface BlockCreate {
  farmId: string;
  name: string;
  area: number;
  maxPlants: number;
  metadata?: Record<string, unknown>;
}

export interface BlockUpdate {
  name?: string;
  area?: number;
  maxPlants?: number;
  metadata?: Record<string, unknown>;
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
}

export interface StateTransition {
  fromState: BlockState;
  toState: BlockState;
}

export interface ValidTransitionsResponse {
  currentState: BlockState;
  validTransitions: BlockState[];
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
  expectedWastePercent?: number;
}

// 4. Fertilizer Schedule
export interface FertilizerApplication {
  stage: GrowthStage;
  fertilizerType: string;
  quantity: number;
  quantityUnit: string;
  frequencyDays: number;
  npkRatio?: string;
}

// 5. Pesticide Schedule
export interface PesticideApplication {
  stage: GrowthStage;
  pesticideType: string;
  quantity: number;
  quantityUnit: string;
  frequencyDays: number;
  preharvestIntervalDays?: number;
  safetyNotes?: string;
}

// 6. Environmental Requirements
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

// 7. Watering Requirements
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

  // 2. Growth Cycle
  growthCycle: GrowthCycleInfo;

  // 3. Yield & Waste
  yieldInfo: YieldWasteInfo;

  // 4. Fertilizer Schedule
  fertilizerSchedule: FertilizerApplication[];

  // 5. Pesticide Schedule
  pesticideSchedule: PesticideApplication[];

  // 6. Environmental Requirements
  environmentalRequirements: EnvironmentalRequirements;

  // 7. Watering Requirements
  wateringRequirements: WateringRequirements;

  // 8. Soil & pH Requirements
  soilRequirements: SoilRequirements;

  // 9. Diseases & Pests
  diseasesAndPests: DiseaseOrPest[];

  // 10. Light Requirements
  lightRequirements: LightRequirements;

  // 11. Quality Grading
  qualityGrades: QualityGrade[];

  // 12. Economics & Labor
  economicsAndLabor: EconomicsAndLabor;

  // 13. Additional Information
  additionalInfo: AdditionalInformation;

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

  // 2. Growth Cycle
  growthCycle: GrowthCycleInfo;

  // 3. Yield & Waste
  yieldInfo: YieldWasteInfo;

  // 4-13: Optional field groups
  fertilizerSchedule?: FertilizerApplication[];
  pesticideSchedule?: PesticideApplication[];
  environmentalRequirements?: EnvironmentalRequirements;
  wateringRequirements?: WateringRequirements;
  soilRequirements?: SoilRequirements;
  diseasesAndPests?: DiseaseOrPest[];
  lightRequirements?: LightRequirements;
  qualityGrades?: QualityGrade[];
  economicsAndLabor?: EconomicsAndLabor;
  additionalInfo?: AdditionalInformation;
}

export interface PlantDataEnhancedUpdate {
  plantName?: string;
  scientificName?: string;
  plantType?: PlantTypeEnum;
  farmTypeCompatibility?: FarmTypeCompatibility[];
  tags?: string[];
  growthCycle?: GrowthCycleInfo;
  yieldInfo?: YieldWasteInfo;
  fertilizerSchedule?: FertilizerApplication[];
  pesticideSchedule?: PesticideApplication[];
  environmentalRequirements?: EnvironmentalRequirements;
  wateringRequirements?: WateringRequirements;
  soilRequirements?: SoilRequirements;
  diseasesAndPests?: DiseaseOrPest[];
  lightRequirements?: LightRequirements;
  qualityGrades?: QualityGrade[];
  economicsAndLabor?: EconomicsAndLabor;
  additionalInfo?: AdditionalInformation;
  isActive?: boolean;
}

// Search Parameters
export interface PlantDataEnhancedSearchParams {
  page?: number;
  perPage?: number;
  search?: string;
  plantType?: PlantTypeEnum;
  farmType?: FarmTypeCompatibility;
  minGrowthCycle?: number;
  maxGrowthCycle?: number;
  tags?: string[];
  isActive?: boolean;
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
    planted: number;
    harvesting: number;
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
  planted: '#10B981',    // Green
  harvesting: '#F59E0B', // Yellow/Orange
  alert: '#EF4444',      // Red
};

export const BLOCK_STATE_LABELS: Record<BlockState, string> = {
  empty: 'Empty',
  planned: 'Planned',
  planted: 'Planted',
  harvesting: 'Harvesting',
  alert: 'Alert',
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
