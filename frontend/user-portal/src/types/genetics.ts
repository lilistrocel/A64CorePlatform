/**
 * Genetics Repo Types
 *
 * Mirrors src/modules/genetics/models/. Two generation counters are carried on
 * every accession:
 *   - cloneGeneration (G): asexual transfers, the senescence signal
 *   - filialGeneration (F): sexual generations, the trait-segregation signal
 * They are orthogonal; a cross that is then cloned four times reads F1 · G4.
 */

// ============================================================================
// ENUMS
// ============================================================================

export type OrganismKind = 'plant' | 'fungus' | 'animal' | 'other';

export type ProvenanceType =
  | 'wild_collected'
  | 'purchased'
  | 'gifted'
  | 'in_house'
  | 'unknown';

export type DerivationType =
  | 'original'
  | 'mutation'
  | 'sector'
  | 'selection'
  | 'cross'
  | 'isolate';

export type VesselForm =
  | 'petri_dish'
  | 'slant'
  | 'liquid_culture'
  | 'grain_spawn'
  | 'bulk_spawn'
  | 'fruiting_block'
  | 'agar_plug'
  | 'tissue_jar'
  | 'sample'
  | 'spore_print'
  | 'spore_syringe'
  | 'seed_lot'
  | 'cutting'
  | 'rooted_plant'
  | 'cryo_vial'
  | 'semen_straw'
  | 'embryo'
  | 'animal'
  | 'other';

export type AccessionStatus =
  | 'active'
  | 'contaminated'
  | 'senescent'
  | 'consumed'
  | 'archived'
  | 'discarded';

export type ParentRole =
  | 'clone_source'
  | 'seed_parent'
  | 'pollen_parent'
  | 'dam'
  | 'sire'
  | 'spore_source'
  | 'unknown';

export type ReproductionMode = 'asexual' | 'sexual';

export type PropagationMethodValue =
  | 'agar_to_agar'
  | 'tissue_clone'
  | 'lc_inoculation'
  | 'grain_transfer'
  | 'bulk_inoculation'
  | 'cutting'
  | 'node_culture'
  | 'division'
  | 'cryo_revival'
  | 'spore_print'
  | 'multispore'
  | 'single_spore'
  | 'seed_from_cross'
  | 'self_pollination'
  | 'breeding'
  | 'artificial_insemination'
  | 'embryo_transfer';

/**
 * Controlled vocabulary for recipe quantities. Mirrors IngredientUnit on the
 * backend, which rejects anything outside this list — free text drifts into
 * g/L, G/L, g/l and gm/L, which are one unit to a person and four to a
 * database, breaking any later ratio or scaling calculation.
 */
export type IngredientUnit =
  | 'g/L'
  | 'mg/L'
  | 'ug/L'
  | 'mL/L'
  | '%w/v'
  | '%v/v'
  | 'ppm'
  | 'g'
  | 'kg'
  | 'mg'
  | 'mL'
  | 'L'
  | 'parts'
  | 'units';

/** Grouped for the picker, so concentrations sit apart from absolute amounts. */
export const INGREDIENT_UNIT_GROUPS: { label: string; units: IngredientUnit[] }[] = [
  { label: 'Concentration (per litre)', units: ['g/L', 'mg/L', 'ug/L', 'mL/L', 'ppm'] },
  { label: 'Percentage — basis matters', units: ['%w/v', '%v/v'] },
  { label: 'Absolute amount', units: ['g', 'kg', 'mg', 'mL', 'L'] },
  { label: 'Relative / count', units: ['parts', 'units'] },
];

export const INGREDIENT_UNIT_LABELS: Record<IngredientUnit, string> = {
  'g/L': 'g/L — grams per litre',
  'mg/L': 'mg/L — milligrams per litre',
  'ug/L': 'µg/L — micrograms per litre',
  'mL/L': 'mL/L — millilitres per litre',
  '%w/v': '%w/v — weight in volume',
  '%v/v': '%v/v — volume in volume',
  ppm: 'ppm — parts per million',
  g: 'g — grams',
  kg: 'kg — kilograms',
  mg: 'mg — milligrams',
  mL: 'mL — millilitres',
  L: 'L — litres',
  parts: 'parts — ratio',
  units: 'units — count',
};

export type MediumTypeValue =
  | 'agar'
  | 'liquid_culture'
  | 'grain'
  | 'bulk_substrate'
  | 'rooting_medium'
  | 'hydroponic_solution'
  | 'feed'
  | 'other';

export type SterilizationMethod =
  | 'autoclave'
  | 'pressure_cooker'
  | 'pasteurization'
  | 'steam'
  | 'chemical'
  | 'none';

export type MediumBatchStatus =
  | 'prepared'
  | 'in_use'
  | 'consumed'
  | 'contaminated'
  | 'discarded';

export type ObservationTypeValue =
  | 'growth'
  | 'morphology'
  | 'contamination'
  | 'sector'
  | 'trait'
  | 'photo'
  | 'note'
  | 'health';

// ============================================================================
// LINE
// ============================================================================

export interface Provenance {
  type: ProvenanceType;
  sourceNote?: string | null;
  acquiredAt?: string | null;
}

export interface Trait {
  name: string;
  value?: string | null;
  notes?: string | null;
}

export interface LineStats {
  totalAccessions: number;
  activeAccessions: number;
  contaminatedAccessions: number;
  maxCloneGeneration: number;
  maxFilialGeneration: number;
  childLineCount: number;
  lastActivityAt?: string | null;
}

export interface GeneticLine {
  id: string;
  code: string;
  commonName: string;
  kind: OrganismKind;
  scientificName?: string | null;
  species?: string | null;
  description?: string | null;
  notes?: string | null;
  parentLineId?: string | null;
  derivation: DerivationType;
  provenance: Provenance;
  traits: Trait[];
  tags: string[];
  linkedStrainId?: string | null;
  linkedPlantDataId?: string | null;
  isActive: boolean;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
  /** Present when the list/detail endpoint was asked for rollups. */
  stats?: LineStats;
}

export interface CreateLinePayload {
  code: string;
  commonName: string;
  kind: OrganismKind;
  scientificName?: string;
  species?: string;
  description?: string;
  notes?: string;
  parentLineId?: string;
  derivation?: DerivationType;
  provenance?: Provenance;
  traits?: Trait[];
  tags?: string[];
}

export type UpdateLinePayload = Partial<CreateLinePayload> & { isActive?: boolean };

// ============================================================================
// ACCESSION
// ============================================================================

export interface ParentRef {
  accessionId?: string | null;
  role: ParentRole;
  lineId?: string | null;
  note?: string | null;
}

export interface StorageLocation {
  /** Real reference into mushroom_facilities. */
  facilityId?: string | null;
  /** Real reference into growing_rooms — what makes room contents queryable. */
  roomId?: string | null;
  /** Free-text fallback for material outside the mushroom module's world. */
  facility?: string | null;
  room?: string | null;
  unit?: string | null;
  position?: string | null;
  temperatureC?: number | null;
}

export interface Accession {
  id: string;
  accessionCode: string;
  lineId: string;
  cloneGeneration: number;
  filialGeneration: number;
  /** Server-computed label: 'G2', or 'F1-G2' once a cross is in the ancestry. */
  generationLabel: string;
  parents: ParentRef[];
  provenance?: Provenance | null;
  form: VesselForm;
  quantity: number;
  unit: string;
  mediumBatchId?: string | null;
  location: StorageLocation;
  acquiredAt?: string | null;
  colonizedAt?: string | null;
  label?: string | null;
  notes?: string | null;
  tags: string[];
  status: AccessionStatus;
  sourceEventId?: string | null;
  splitFromAccessionId?: string | null;
  discardedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAccessionPayload {
  lineId: string;
  form: VesselForm;
  quantity?: number;
  unit?: string;
  mediumBatchId?: string;
  location?: StorageLocation;
  acquiredAt?: string;
  label?: string;
  notes?: string;
  tags?: string[];
  cloneGeneration?: number;
  filialGeneration?: number;
  parents?: ParentRef[];
  provenance?: Provenance;
  accessionCode?: string;
}

export type UpdateAccessionPayload = Partial<
  Pick<
    Accession,
    | 'form'
    | 'quantity'
    | 'unit'
    | 'mediumBatchId'
    | 'location'
    | 'label'
    | 'notes'
    | 'tags'
    | 'status'
    | 'cloneGeneration'
    | 'filialGeneration'
  >
>;

export interface SplitAccessionPayload {
  quantity: number;
  reason?: string;
  status?: AccessionStatus;
  label?: string;
}

export interface SplitResult {
  source: Accession;
  split: Accession;
}

// ============================================================================
// PROPAGATION
// ============================================================================

export interface PropagationTarget {
  form: VesselForm;
  quantity: number;
  unit?: string;
  mediumBatchId?: string;
  location?: StorageLocation;
  label?: string;
  notes?: string;
  cloneGenerationOverride?: number;
  filialGenerationOverride?: number;
  targetLineId?: string;
}

export interface CreatePropagationPayload {
  method: PropagationMethodValue;
  parents: ParentRef[];
  targets: PropagationTarget[];
  performedAt?: string;
  operatorName?: string;
  mediumBatchId?: string;
  /** SOP followed. Must be ACTIVE; pinned by version onto the event. */
  protocolId?: string;
  notes?: string;
}

export interface PropagationEvent {
  id: string;
  eventCode?: string | null;
  method: PropagationMethodValue;
  reproductionMode: ReproductionMode;
  parents: ParentRef[];
  resultAccessionIds: string[];
  sourceLineIds: string[];
  resultLineIds: string[];
  vesselCount: number;
  mediumBatchId?: string | null;
  performedAt: string;
  performedBy?: string | null;
  operatorName?: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface PropagationOutcome {
  event: PropagationEvent;
  accessions: Accession[];
}

/** Describes how a method affects the generation counters — drives the form. */
export interface MethodInfo {
  value: PropagationMethodValue;
  reproductionMode: ReproductionMode;
  maxParents: number;
  advancesCloneGeneration: boolean;
  advancesFilialGeneration: boolean;
  resetsCloneGeneration: boolean;
}

// ============================================================================
// MEDIUM
// ============================================================================

export interface Ingredient {
  name: string;
  amount?: number | null;
  /** Controlled — the backend rejects anything outside IngredientUnit. */
  unit?: IngredientUnit | null;
  notes?: string | null;
}

export interface Additive extends Ingredient {
  purpose?: string | null;
  isExperimental: boolean;
}

export interface Sterilization {
  method: SterilizationMethod;
  temperatureC?: number | null;
  minutes?: number | null;
  pressurePsi?: number | null;
}

export interface MediumRecipe {
  id: string;
  name: string;
  code: string;
  type: MediumTypeValue;
  description?: string | null;
  ingredients: Ingredient[];
  additives: Additive[];
  targetPh?: number | null;
  sterilization: Sterilization;
  yieldsVessels?: number | null;
  notes?: string | null;
  version: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRecipePayload {
  name: string;
  code: string;
  type: MediumTypeValue;
  description?: string;
  ingredients?: Ingredient[];
  additives?: Additive[];
  targetPh?: number;
  sterilization?: Sterilization;
  notes?: string;
}

export type UpdateRecipePayload = Partial<CreateRecipePayload> & { isActive?: boolean };

export interface BatchQC {
  contaminatedCount: number;
  notes?: string | null;
}

export interface MediumBatch {
  id: string;
  batchCode: string;
  recipeId: string;
  recipeVersion: number;
  recipeName?: string | null;
  type: MediumTypeValue;
  ingredientsSnapshot: Ingredient[];
  additivesSnapshot: Additive[];
  sterilization: Sterilization;
  preparedAt: string;
  preparedBy?: string | null;
  vesselCount: number;
  vesselType?: string | null;
  sterilizerRun?: string | null;
  status: MediumBatchStatus;
  qc: BatchQC;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBatchPayload {
  recipeId: string;
  batchCode?: string;
  preparedAt?: string;
  vesselCount: number;
  vesselType?: string;
  sterilizerRun?: string;
  /** SOP followed. Must be ACTIVE; pinned by version onto the batch. */
  protocolId?: string;
  notes?: string;
}

export type UpdateBatchPayload = Partial<
  Pick<MediumBatch, 'batchCode' | 'vesselCount' | 'vesselType' | 'sterilizerRun' | 'status' | 'notes'>
> & { qc?: BatchQC };

export interface AdditiveReadout {
  additive: string;
  accessions: Accession[];
  batches: MediumBatch[];
  meta: PaginationMeta;
}

// ============================================================================
// OBSERVATION
// ============================================================================

export interface ObservationMetrics {
  growthRateMmPerDay?: number | null;
  colonizationPercent?: number | null;
  daysToFull?: number | null;
  contaminationPercent?: number | null;
  vigorScore?: number | null;
  temperatureC?: number | null;
  humidityPercent?: number | null;
}

export interface Observation {
  id: string;
  accessionId: string;
  lineId?: string | null;
  type: ObservationTypeValue;
  observedAt: string;
  text?: string | null;
  metrics: ObservationMetrics;
  attachmentIds: string[];
  isNovelTrait: boolean;
  traitName?: string | null;
  promotedToLineId?: string | null;
  observedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateObservationPayload {
  accessionId: string;
  type: ObservationTypeValue;
  observedAt?: string;
  text?: string;
  metrics?: ObservationMetrics;
  isNovelTrait?: boolean;
  traitName?: string;
}

export interface PromoteTraitPayload {
  code: string;
  commonName: string;
  derivation?: DerivationType;
  description?: string;
  notes?: string;
  createFoundingAccession?: boolean;
}

export interface PromotionResult {
  line: GeneticLine;
  foundingAccession?: Accession | null;
}

// ============================================================================
// LINEAGE
// ============================================================================

export interface LineageNode {
  accessionId: string;
  accessionCode: string;
  lineId: string;
  lineCode?: string | null;
  lineName?: string | null;
  cloneGeneration: number;
  filialGeneration: number;
  generationLabel: string;
  form: VesselForm;
  quantity: number;
  unit: string;
  status: AccessionStatus;
  mediumBatchId?: string | null;
  mediumBatchCode?: string | null;
  acquiredAt?: string | null;
  createdAt?: string | null;
  depth: number;
  isRoot: boolean;
  hasUnknownParent: boolean;
}

export interface LineageEdge {
  fromAccessionId?: string | null;
  toAccessionId: string;
  role: ParentRole;
  eventId?: string | null;
  method?: PropagationMethodValue | null;
  reproductionMode?: ReproductionMode | null;
  performedAt?: string | null;
  mediumBatchId?: string | null;
  mediumBatchCode?: string | null;
}

export interface LineageGraph {
  rootAccessionId?: string | null;
  rootLineId?: string | null;
  nodes: LineageNode[];
  edges: LineageEdge[];
  maxDepth: number;
  truncated: boolean;
}

export interface AncestryStep {
  accessionId?: string | null;
  accessionCode?: string | null;
  lineId?: string | null;
  lineCode?: string | null;
  generationLabel?: string | null;
  role: ParentRole;
  method?: PropagationMethodValue | null;
  performedAt?: string | null;
  mediumBatchCode?: string | null;
  isUnknown: boolean;
}

export interface AncestryChain {
  accessionId: string;
  steps: AncestryStep[];
  hasBranching: boolean;
  reachedUnknownOrigin: boolean;
}

// ============================================================================
// DASHBOARD & SHARED
// ============================================================================

/**
 * Reverse link from a growing profile to the genetic lines that carry it.
 * Keyed by `mushroom_strains.strainId` and `plant_data.plantDataId`.
 */
export interface LinkedProfileCounts {
  strains: Record<string, number>;
  plants: Record<string, number>;
}

/** Live material held in one room. Mirrors the mushroom module's RoomOccupancy. */
export interface RoomOccupancy {
  vessels: number;
  records: number;
  byForm: Record<string, number>;
}

export interface KindBreakdown {
  plant: number;
  fungus: number;
  animal: number;
  other: number;
}

export interface GeneticsDashboard {
  totalLines: number;
  activeLines: number;
  linesByKind: KindBreakdown;
  totalAccessions: number;
  activeAccessions: number;
  contaminatedAccessions: number;
  totalVessels: number;
  propagationsLast30Days: number;
  observationsLast30Days: number;
  novelTraitsPending: number;
  senescenceWatchCount: number;
  mediumBatchesActive: number;
}

export interface PaginationMeta {
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

export interface Paginated<T> {
  data: T[];
  meta: PaginationMeta;
}

// ============================================================================
// DISPLAY LABELS
// ============================================================================

export const KIND_LABELS: Record<OrganismKind, string> = {
  plant: 'Plant',
  fungus: 'Fungus',
  animal: 'Animal',
  other: 'Other',
};

export const KIND_ICONS: Record<OrganismKind, string> = {
  plant: '🌿',
  fungus: '🍄',
  animal: '🐐',
  other: '🧬',
};

export const VESSEL_LABELS: Record<VesselForm, string> = {
  petri_dish: 'Petri dish',
  slant: 'Slant',
  liquid_culture: 'Liquid culture',
  grain_spawn: 'Grain spawn',
  bulk_spawn: 'Bulk spawn',
  fruiting_block: 'Fruiting block',
  agar_plug: 'Agar plug',
  tissue_jar: 'Tissue jar',
  sample: 'Sample',
  spore_print: 'Spore print',
  spore_syringe: 'Spore syringe',
  seed_lot: 'Seed lot',
  cutting: 'Cutting',
  rooted_plant: 'Rooted plant',
  cryo_vial: 'Cryo vial',
  semen_straw: 'Semen straw',
  embryo: 'Embryo',
  animal: 'Animal',
  other: 'Other',
};

export const STATUS_LABELS: Record<AccessionStatus, string> = {
  active: 'Active',
  contaminated: 'Contaminated',
  senescent: 'Senescent',
  consumed: 'Consumed',
  archived: 'Archived',
  discarded: 'Discarded',
};

export const METHOD_LABELS: Record<PropagationMethodValue, string> = {
  agar_to_agar: 'Agar-to-agar transfer',
  tissue_clone: 'Tissue clone',
  lc_inoculation: 'Liquid culture inoculation',
  grain_transfer: 'Grain transfer',
  bulk_inoculation: 'Bulk inoculation (spawn to block)',
  cutting: 'Cutting',
  node_culture: 'Node culture',
  division: 'Division',
  cryo_revival: 'Cryo revival',
  spore_print: 'Spore print',
  multispore: 'Multispore',
  single_spore: 'Single spore isolation',
  seed_from_cross: 'Seed from cross',
  self_pollination: 'Self-pollination',
  breeding: 'Breeding',
  artificial_insemination: 'Artificial insemination',
  embryo_transfer: 'Embryo transfer',
};

export const ROLE_LABELS: Record<ParentRole, string> = {
  clone_source: 'Clone source',
  seed_parent: 'Seed parent (mother)',
  pollen_parent: 'Pollen parent (father)',
  dam: 'Dam (mother)',
  sire: 'Sire (father)',
  spore_source: 'Spore source',
  unknown: 'Unknown',
};

export const DERIVATION_LABELS: Record<DerivationType, string> = {
  original: 'Original',
  mutation: 'Mutation',
  sector: 'Sector',
  selection: 'Selection',
  cross: 'Cross',
  isolate: 'Isolate',
};

export const PROVENANCE_LABELS: Record<ProvenanceType, string> = {
  wild_collected: 'Wild collected',
  purchased: 'Purchased',
  gifted: 'Gifted',
  in_house: 'In-house',
  unknown: 'Unknown',
};

export const OBSERVATION_LABELS: Record<ObservationTypeValue, string> = {
  growth: 'Growth',
  morphology: 'Morphology',
  contamination: 'Contamination',
  sector: 'Sector',
  trait: 'Trait',
  photo: 'Photo',
  note: 'Note',
  health: 'Health',
};

export const MEDIUM_TYPE_LABELS: Record<MediumTypeValue, string> = {
  agar: 'Agar',
  liquid_culture: 'Liquid culture',
  grain: 'Grain',
  bulk_substrate: 'Bulk substrate',
  rooting_medium: 'Rooting medium',
  hydroponic_solution: 'Hydroponic solution',
  feed: 'Feed',
  other: 'Other',
};

export const BATCH_STATUS_LABELS: Record<MediumBatchStatus, string> = {
  prepared: 'Prepared',
  in_use: 'In use',
  consumed: 'Consumed',
  contaminated: 'Contaminated',
  discarded: 'Discarded',
};

/**
 * Clone generations at or above this depth are surfaced as a senescence watch.
 * Mirrors SENESCENCE_WATCH_GENERATION in the backend dashboard service.
 */
export const SENESCENCE_WATCH_GENERATION = 5;
