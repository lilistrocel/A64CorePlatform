/**
 * Mushroom Module TypeScript Type Definitions
 *
 * All types used across the mushroom farming frontend module.
 * Based on the backend API response schemas.
 */

import { theme } from '@a64core/shared';
import type { PhaseKey } from '@a64core/shared';

const c = theme.colors;

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

// Night Observatory (T-901): RoomPhase IS the spec §5.1 room-phase
// vocabulary verbatim (fruiting_initiation === fruitingInit), so this maps
// 1:1 onto colors.phase.* rather than any derived/extrapolated rule.
// `harvesting` is the one sanctioned gold status (spec §3); every other
// entry that previously reached into the raw gold ramp (`colonizing`,
// `maintenance`) has moved off gold entirely.
//
// Consolidation pass (T-901 shard NON-UI-CLEANUP): PHASE_COLORS below is now
// DERIVED from ROOM_PHASE_TO_PHASE_KEY rather than a second hand-written
// table. `components/mushroom/phaseTheme.ts` (a sibling shard's file,
// components/ is out of this shard's scope to edit) currently declares its
// own copy of this exact mapping as `ROOM_PHASE_TO_KEY` — that copy is now
// redundant and can be replaced with an import of ROOM_PHASE_TO_PHASE_KEY
// from here in a follow-up pass.
export const ROOM_PHASE_TO_PHASE_KEY: Record<RoomPhase, PhaseKey> = {
  empty: 'empty',
  preparing: 'preparing',
  inoculated: 'inoculated',
  colonizing: 'colonizing',
  fruiting_initiation: 'fruitingInit',
  fruiting: 'fruiting',
  harvesting: 'harvesting',
  resting: 'resting',
  cleaning: 'cleaning',
  quarantined: 'quarantined',
  decommissioned: 'decommissioned',
  maintenance: 'maintenance',
};

export const PHASE_COLORS: Record<RoomPhase, string> = Object.fromEntries(
  (Object.entries(ROOM_PHASE_TO_PHASE_KEY) as Array<[RoomPhase, PhaseKey]>).map(
    ([phase, key]) => [phase, c.phase[key]]
  )
) as Record<RoomPhase, string>;

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

// Text colours chosen for WCAG contrast against the matching PHASE_COLORS
// solid background (verified against the darkTheme phase hexes, spec §1.2).
// Every `phase.*` value except `decommissioned` is a "-b" brightened/pastel
// tone (they're built to glow on a dark ground), so cosmos (dark, `onAccent`
// — spec §1.1's flipped meaning: "text on a bright fill") reads correctly on
// all of them; only `decommissioned` (dim, no-glow slate) is dark enough to
// need cream (`onDark`) instead. Never dark text on a phase-tinted
// *transparent* badge background (spec §9) — this map is for the SOLID chip
// pattern these three consumers use (MushroomRoomMonitor, RoomDetailsModal,
// GrowingRoomCard), which is a different pattern from the §4 16%-tint badge.
export const PHASE_TEXT_COLORS: Record<RoomPhase, string> = {
  empty: c.onAccent,
  preparing: c.onAccent,
  inoculated: c.onAccent,
  colonizing: c.onAccent,
  fruiting_initiation: c.onAccent,
  fruiting: c.onAccent,
  harvesting: c.onAccent,
  resting: c.onAccent,
  cleaning: c.onAccent,
  quarantined: c.onAccent,
  decommissioned: c.onDark,
  maintenance: c.onAccent,
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
  /**
   * Dry substrate weight for THIS block, overriding the room-level figure.
   * Needed for a comparable BE when a room holds blocks from several batches.
   */
  substrateWeightKg?: number;
  notes?: string;
  /**
   * The fruiting block this came off, as a genetic_accessions id. Supplying it
   * is what lets yield be attributed to a lineage rather than just a species.
   */
  accessionId?: string;
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
  A: c.success,        // emerald
  B: c.primary[500],   // lapis
  C: c.warning,        // gold
  D: c.error,           // terracotta
  rejected: c.textSecondary,
};

export const DIFFICULTY_LABELS: Record<MushroomDifficulty, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  expert: 'Expert',
};

export const DIFFICULTY_COLORS: Record<MushroomDifficulty, string> = {
  beginner: c.success,       // emerald
  intermediate: c.primary[500], // lapis
  advanced: c.warning,       // gold
  expert: c.error,           // terracotta
};
