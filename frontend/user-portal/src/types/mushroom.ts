/**
 * Mushroom Module TypeScript Type Definitions
 *
 * All types used across the mushroom farming frontend module.
 * Based on the backend API response schemas.
 */

// ============================================================================
// ENUMS
// ============================================================================

export type RoomPhase =
  | 'empty'
  | 'preparing'
  | 'inoculated'
  | 'colonizing'
  | 'fruiting_initiation'
  | 'fruiting'
  | 'harvesting'
  | 'resting'
  | 'cleaning'
  | 'quarantined'
  | 'decommissioned'
  | 'maintenance';

export type FacilityType =
  | 'indoor'
  | 'greenhouse'
  | 'outdoor'
  | 'hybrid'
  | 'container'
  | 'cave';

export type FacilityStatus = 'active' | 'inactive' | 'maintenance' | 'construction';

export type MushroomDifficulty = 'beginner' | 'intermediate' | 'advanced' | 'expert';

export type SubstrateType =
  | 'straw'
  | 'sawdust'
  | 'wood_chips'
  | 'manure'
  | 'coffee_grounds'
  | 'cottonseed'
  | 'corn_cobs'
  | 'mixed';

export type SubstrateStatus = 'mixing' | 'sterilizing' | 'inoculating' | 'colonizing' | 'ready' | 'depleted' | 'discarded';

export type HarvestQualityGrade = 'A' | 'B' | 'C' | 'D' | 'rejected';

export type ContaminationType =
  | 'green_mold'
  | 'black_mold'
  | 'cobweb'
  | 'bacterial_blotch'
  | 'bacterial_rot'
  | 'pest'
  | 'other';

export type ContaminationStatus = 'detected' | 'monitoring' | 'treating' | 'resolved' | 'eliminated';

export type ContaminationSeverity = 'low' | 'medium' | 'high' | 'critical';

// ============================================================================
// PHASE COLOR MAPPING
// ============================================================================

export const PHASE_COLORS: Record<RoomPhase, string> = {
  empty: '#9e9e9e',
  preparing: '#90caf9',
  inoculated: '#42a5f5',
  colonizing: '#fdd835',
  fruiting_initiation: '#ffa726',
  fruiting: '#66bb6a',
  harvesting: '#2e7d32',
  resting: '#80deea',
  cleaning: '#bdbdbd',
  quarantined: '#ef5350',
  decommissioned: '#616161',
  maintenance: '#ce93d8',
};

export const PHASE_LABELS: Record<RoomPhase, string> = {
  empty: 'Empty',
  preparing: 'Preparing',
  inoculated: 'Inoculated',
  colonizing: 'Colonizing',
  fruiting_initiation: 'Fruiting Init.',
  fruiting: 'Fruiting',
  harvesting: 'Harvesting',
  resting: 'Resting',
  cleaning: 'Cleaning',
  quarantined: 'Quarantined',
  decommissioned: 'Decommissioned',
  maintenance: 'Maintenance',
};

export const PHASE_TEXT_COLORS: Record<RoomPhase, string> = {
  empty: '#fff',
  preparing: '#1565c0',
  inoculated: '#fff',
  colonizing: '#4e3400',
  fruiting_initiation: '#4e2100',
  fruiting: '#fff',
  harvesting: '#fff',
  resting: '#006064',
  cleaning: '#424242',
  quarantined: '#fff',
  decommissioned: '#fff',
  maintenance: '#4a148c',
};

// ============================================================================
// FACILITY
// ============================================================================

export interface Facility {
  id: string;
  name: string;
  location?: string;
  facilityType: FacilityType;
  status: FacilityStatus;
  totalRooms: number;
  activeRooms: number;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFacilityPayload {
  name: string;
  location?: string;
  facilityType: FacilityType;
  status?: FacilityStatus;
  description?: string;
}

export interface UpdateFacilityPayload {
  name?: string;
  location?: string;
  facilityType?: FacilityType;
  status?: FacilityStatus;
  description?: string;
}

// ============================================================================
// ROOM
// ============================================================================

/**
 * What a room is for. Only a FRUITING room runs one crop through a lifecycle;
 * every other type is a container holding independently tracked items (petri
 * dishes, spawn jars, blocks), so it has no single strain or phase.
 */
export type RoomType =
  | 'lab'
  | 'spawn'
  | 'substrate_prep'
  | 'incubation'
  | 'fruiting'
  | 'storage'
  | 'harvest_pack';

export const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  lab: 'Lab (agar / LC)',
  spawn: 'Spawn incubation',
  substrate_prep: 'Substrate prep',
  incubation: 'Block incubation',
  fruiting: 'Fruiting',
  storage: 'Storage / culture library',
  harvest_pack: 'Harvest & packing',
};

export const ROOM_TYPE_ICONS: Record<RoomType, string> = {
  lab: '\u{1F9EB}',
  spawn: '\u{1FAD9}',
  substrate_prep: '\u{1F33E}',
  incubation: '\u{1F4E6}',
  fruiting: '\u{1F344}',
  storage: '\u{2744}\u{FE0F}',
  harvest_pack: '\u{1F4CB}',
};

/**
 * Phases a container room may hold. Mirrors OPERATIONAL_PHASES on the backend —
 * a lab is never "fruiting"; the dishes inside it have states, the room is just
 * open, being cleaned, shut for maintenance or quarantined.
 */
export const OPERATIONAL_PHASES: RoomPhase[] = [
  'empty',
  'cleaning',
  'quarantined',
  'maintenance',
];

/** Room types that run a single-crop lifecycle. Mirrors BATCH_ROOM_TYPES. */
export const BATCH_ROOM_TYPES: RoomType[] = ['fruiting'];

export function isBatchRoom(roomType?: RoomType): boolean {
  return !!roomType && BATCH_ROOM_TYPES.includes(roomType);
}

/** Live material held in one room, from /genetics/accessions/room-occupancy. */
/**
 * Harvest performance for one genetic line at one clone generation.
 * The point of the grouping: a decline in avgBE as cloneGeneration climbs is
 * senescence made measurable.
 */
export interface LineYieldRow {
  lineId: string;
  lineCode?: string | null;
  cloneGeneration?: number | null;
  totalKg: number;
  harvests: number;
  avgBE?: number | null;
  blockCount: number;
  lastHarvestAt?: string | null;
}

export interface RoomOccupancy {
  vessels: number;
  records: number;
  byForm: Record<string, number>;
}

export interface GrowingRoom {
  id: string;
  facilityId: string;
  roomCode: string;
  name?: string;
  roomType: RoomType;
  capacity?: number;
  currentPhase: RoomPhase;
  strainId?: string;
  strainName?: string;
  substrateId?: string;
  substrateName?: string;
  currentFlush: number;
  maxFlushes?: number;
  biologicalEfficiency?: number;
  phaseStartDate?: string;
  inoculationDate?: string;
  expectedHarvestDate?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRoomPayload {
  roomCode: string;
  name?: string;
  roomType?: RoomType;
  capacity?: number;
  notes?: string;
}

export interface UpdateRoomPayload {
  roomCode?: string;
  name?: string;
  roomType?: RoomType;
  capacity?: number;
  notes?: string;
  strainId?: string;
  substrateBatchId?: string;
  substrateWeight?: number;
}

export interface AdvancePhasePayload {
  targetPhase: RoomPhase;
  strainId?: string;
  substrateId?: string;
  notes?: string;
}

// ============================================================================
// STRAIN
// ============================================================================

export interface MushroomStrain {
  id: string;
  commonName: string;
  scientificName?: string;
  species: string;
  difficulty: MushroomDifficulty;
  expectedYieldKgPerKgSubstrate?: number;
  maxFlushes?: number;
  colonizationTempMin?: number;
  colonizationTempMax?: number;
  fruitingTempMin?: number;
  fruitingTempMax?: number;
  colonizationHumidityMin?: number;
  fruitingHumidityMin?: number;
  co2TolerancePpm?: number;
  colonizationDaysMin?: number;
  colonizationDaysMax?: number;
  fruitingDaysMin?: number;
  fruitingDaysMax?: number;
  description?: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateStrainPayload {
  commonName: string;
  scientificName?: string;
  species: string;
  difficulty?: MushroomDifficulty;
  expectedYieldKgPerKgSubstrate?: number;
  maxFlushes?: number;
  colonizationTempMin?: number;
  colonizationTempMax?: number;
  fruitingTempMin?: number;
  fruitingTempMax?: number;
  colonizationHumidityMin?: number;
  fruitingHumidityMin?: number;
  co2TolerancePpm?: number;
  colonizationDaysMin?: number;
  colonizationDaysMax?: number;
  fruitingDaysMin?: number;
  fruitingDaysMax?: number;
  description?: string;
  notes?: string;
}

// ============================================================================
// SUBSTRATE BATCH
// ============================================================================

export interface SubstrateBatch {
  id: string;
  facilityId: string;
  batchCode: string;
  substrateType: SubstrateType;
  status: SubstrateStatus;
  totalWeightKg?: number;
  remainingWeightKg?: number;
  preparationDate?: string;
  sterilizationDate?: string;
  readyDate?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSubstratePayload {
  batchCode: string;
  substrateType: SubstrateType;
  status?: SubstrateStatus;
  totalWeightKg?: number;
  preparationDate?: string;
  notes?: string;
}

// ============================================================================
// HARVEST
// ============================================================================

export interface MushroomHarvest {
  id: string;
  facilityId: string;
  roomId: string;
  roomCode?: string;
  strainId?: string;
  strainName?: string;
  flushNumber: number;
  harvestDate: string;
  weightKg: number;
  qualityGrade: HarvestQualityGrade;
  biologicalEfficiency?: number;
  substrateWeightKg?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateHarvestPayload {
  flushNumber?: number;
  harvestDate?: string;
  weightKg: number;
  qualityGrade?: HarvestQualityGrade;
  substrateWeightKg?: number;
  notes?: string;
}

// ============================================================================
// ENVIRONMENT READING
// ============================================================================

export interface EnvironmentReading {
  id: string;
  facilityId: string;
  roomId: string;
  temperature?: number;
  humidity?: number;
  co2Ppm?: number;
  lightLux?: number;
  recordedAt: string;
  createdAt: string;
}

export interface CreateEnvironmentReadingPayload {
  temperature?: number;
  humidity?: number;
  co2Ppm?: number;
  lightLux?: number;
  recordedAt?: string;
}

// ============================================================================
// CONTAMINATION
// ============================================================================

export interface ContaminationReport {
  id: string;
  facilityId: string;
  roomId: string;
  roomCode?: string;
  contaminationType: ContaminationType;
  severity: ContaminationSeverity;
  status: ContaminationStatus;
  detectedDate: string;
  resolvedDate?: string;
  affectedAreaPercent?: number;
  description?: string;
  treatmentNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateContaminationPayload {
  contaminationType: ContaminationType;
  severity: ContaminationSeverity;
  detectedDate?: string;
  affectedAreaPercent?: number;
  description?: string;
}

export interface ResolveContaminationPayload {
  resolvedDate?: string;
  treatmentNotes?: string;
}

// ============================================================================
// DASHBOARD
// ============================================================================

export interface MushroomDashboardData {
  totalFacilities: number;
  totalRooms: number;
  activeRooms: number;
  roomsByPhase: Partial<Record<RoomPhase, number>>;
  recentHarvests: MushroomHarvest[];
  activeContaminations: ContaminationReport[];
  totalHarvestThisMonth?: number;
  averageBiologicalEfficiency?: number;
}

export interface FacilityAnalyticsData {
  facilityId: string;
  facilityName: string;
  totalHarvestKg: number;
  averageBiologicalEfficiency: number;
  harvestsByFlush: Array<{ flush: number; totalKg: number; count: number }>;
  harvestsByMonth: Array<{ month: string; totalKg: number }>;
  phaseDistribution: Partial<Record<RoomPhase, number>>;
  contaminationRate: number;
  topPerformingRooms: Array<{ roomCode: string; totalKg: number; avgBE: number }>;
}

// ============================================================================
// API RESPONSE WRAPPERS
// ============================================================================

export interface SuccessResponse<T> {
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    perPage: number;
    totalPages: number;
  };
}

// ============================================================================
// QUALITY GRADE DISPLAY
// ============================================================================

export const QUALITY_GRADE_LABELS: Record<HarvestQualityGrade, string> = {
  A: 'Grade A - Premium',
  B: 'Grade B - Good',
  C: 'Grade C - Standard',
  D: 'Grade D - Low',
  rejected: 'Rejected',
};

export const QUALITY_GRADE_COLORS: Record<HarvestQualityGrade, string> = {
  A: '#10B981',
  B: '#3B82F6',
  C: '#F59E0B',
  D: '#EF4444',
  rejected: '#6B7280',
};

export const DIFFICULTY_LABELS: Record<MushroomDifficulty, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  expert: 'Expert',
};

export const DIFFICULTY_COLORS: Record<MushroomDifficulty, string> = {
  beginner: '#10B981',
  intermediate: '#3B82F6',
  advanced: '#F59E0B',
  expert: '#EF4444',
};
