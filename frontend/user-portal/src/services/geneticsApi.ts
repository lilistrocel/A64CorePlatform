/**
 * Genetics Repo API Service
 *
 * Calls against /api/v1/genetics — lines, accessions, propagations, media,
 * observations and lineage.
 */

import axios from 'axios';
import { apiClient } from './api';
import type {
  Accession,
  AdditiveReadout,
  AncestryChain,
  CreateAccessionPayload,
  CreateBatchPayload,
  CreateLinePayload,
  CreateObservationPayload,
  CreatePropagationPayload,
  CreateRecipePayload,
  GeneticLine,
  GeneticsDashboard,
  LineageGraph,
  LinkedProfileCounts,
  MediumBatch,
  MediumRecipe,
  MethodInfo,
  Observation,
  Paginated,
  PromoteTraitPayload,
  PromotionResult,
  PropagationEvent,
  PropagationOutcome,
  RoomOccupancy,
  SplitAccessionPayload,
  SplitResult,
  UpdateAccessionPayload,
  UpdateBatchPayload,
  UpdateLinePayload,
  UpdateRecipePayload,
} from '../types/genetics';

const BASE = '/v1/genetics';

// ============================================================================
// LINES
// ============================================================================

export interface ListLinesParams {
  page?: number;
  perPage?: number;
  kind?: string;
  search?: string;
  tag?: string;
  parentLineId?: string;
  linkedStrainId?: string;
  linkedPlantDataId?: string;
  activeOnly?: boolean;
  withStats?: boolean;
}

export async function listLines(params: ListLinesParams = {}): Promise<Paginated<GeneticLine>> {
  const { data } = await apiClient.get(`${BASE}/lines`, { params });
  return data;
}

/**
 * Reverse link for the Strain / Plant libraries: how many genetic lines carry
 * each growing profile. One request annotates every row on a library page.
 */
export async function getLinkedProfileCounts(): Promise<LinkedProfileCounts> {
  const { data } = await apiClient.get(`${BASE}/lines/linked-counts`);
  return data.data;
}

export async function getLine(lineId: string): Promise<GeneticLine> {
  const { data } = await apiClient.get(`${BASE}/lines/${lineId}`);
  return data.data;
}

export async function createLine(payload: CreateLinePayload): Promise<GeneticLine> {
  const { data } = await apiClient.post(`${BASE}/lines`, payload);
  return data.data;
}

export async function updateLine(lineId: string, payload: UpdateLinePayload): Promise<GeneticLine> {
  const { data } = await apiClient.patch(`${BASE}/lines/${lineId}`, payload);
  return data.data;
}

export async function deactivateLine(lineId: string): Promise<GeneticLine> {
  const { data } = await apiClient.delete(`${BASE}/lines/${lineId}`);
  return data.data;
}

// ============================================================================
// ACCESSIONS
// ============================================================================

export interface ListAccessionsParams {
  page?: number;
  perPage?: number;
  lineId?: string;
  status?: string;
  form?: string;
  mediumBatchId?: string;
  roomId?: string;
  facilityId?: string;
  generation?: number;
  search?: string;
  activeOnly?: boolean;
}

export async function listAccessions(
  params: ListAccessionsParams = {}
): Promise<Paginated<Accession>> {
  const { data } = await apiClient.get(`${BASE}/accessions`, { params });
  return data;
}

/**
 * Live material per room, keyed by roomId. One request annotates every room on
 * a facility page; excludes discarded and consumed records.
 */
export async function getRoomOccupancy(
  facilityId?: string
): Promise<Record<string, RoomOccupancy>> {
  const { data } = await apiClient.get(`${BASE}/accessions/room-occupancy`, {
    params: facilityId ? { facilityId } : {},
  });
  return data.data;
}

export async function getAccession(accessionId: string): Promise<Accession> {
  const { data } = await apiClient.get(`${BASE}/accessions/${accessionId}`);
  return data.data;
}

/** Resolve a scanned or typed label code, e.g. 'PO-BLU-G2-014'. */
export async function getAccessionByCode(code: string): Promise<Accession> {
  const { data } = await apiClient.get(`${BASE}/accessions/by-code/${encodeURIComponent(code)}`);
  return data.data;
}

export async function getAccessionChildren(accessionId: string): Promise<Accession[]> {
  const { data } = await apiClient.get(`${BASE}/accessions/${accessionId}/children`);
  return data.data;
}

export async function createAccession(payload: CreateAccessionPayload): Promise<Accession> {
  const { data } = await apiClient.post(`${BASE}/accessions`, payload);
  return data.data;
}

export async function updateAccession(
  accessionId: string,
  payload: UpdateAccessionPayload
): Promise<Accession> {
  const { data } = await apiClient.patch(`${BASE}/accessions/${accessionId}`, payload);
  return data.data;
}

export async function splitAccession(
  accessionId: string,
  payload: SplitAccessionPayload
): Promise<SplitResult> {
  const { data } = await apiClient.post(`${BASE}/accessions/${accessionId}/split`, payload);
  return data.data;
}

// ============================================================================
// LABELS (T-804 §5.1) — GET .../labels?from=&to=&size=, application/pdf.
// A read in permission (require_view) but not in effect: a successful call
// raises the accession's labelledVesselCount server-side, spec §5.1.
// ============================================================================

export interface GetLabelsPdfParams {
  from?: number;
  to?: number;
  // Mirrors `_parse_tape_spec` in src/modules/genetics/api/v1/labels.py:
  // '29x90' / '17x87' (fixed die-cut) or '62xN' (continuous, N = length in
  // mm, 12-100 inclusive, e.g. '62x15'). Plain `string` rather than a
  // template-literal type — the caller (PrintLabelsModal) composes this from
  // a runtime numeric input, so a literal type would not narrow correctly;
  // the server is the real validator either way (400 on anything invalid).
  size?: string;
}

export interface LabelsPdfResult {
  blob: Blob;
  /** Read off the response's Content-Disposition header — authoritative,
   * never constructed client-side (the backend embeds the accession code
   * and the resolved from/to range in it). */
  filename: string;
}

/**
 * Fetch a print-ready label PDF for a vessel range.
 *
 * `responseType: 'blob'` applies to error bodies too, not just success ones
 * — a 400 (bad range/size) arrives as a Blob containing the JSON error, not
 * parsed JSON. Unwrapped here so a caller sees a normal `Error` carrying the
 * backend's actual `detail` text via `.message`, matching how every other
 * genetics mutation in this module surfaces its error.
 */
export async function getLabelsPdf(
  accessionId: string,
  params: GetLabelsPdfParams = {}
): Promise<LabelsPdfResult> {
  try {
    const response = await apiClient.get(`${BASE}/accessions/${accessionId}/labels`, {
      params,
      responseType: 'blob',
    });
    const disposition = response.headers['content-disposition'] as string | undefined;
    const match = disposition ? /filename="([^"]+)"/.exec(disposition) : null;
    return {
      blob: response.data as Blob,
      filename: match?.[1] ?? `labels-${accessionId}.pdf`,
    };
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.data instanceof Blob) {
      const text = await err.response.data.text();
      let detail: string | undefined;
      try {
        detail = (JSON.parse(text) as { detail?: string }).detail;
      } catch {
        // Error body wasn't JSON — leave detail undefined, fall through to
        // rethrowing the original AxiosError below.
      }
      if (detail) {
        throw new Error(detail);
      }
    }
    throw err;
  }
}

// ============================================================================
// PROPAGATIONS
// ============================================================================

export async function listPropagationMethods(): Promise<MethodInfo[]> {
  const { data } = await apiClient.get(`${BASE}/propagations/methods`);
  return data.data;
}

export async function createPropagation(
  payload: CreatePropagationPayload
): Promise<PropagationOutcome> {
  const { data } = await apiClient.post(`${BASE}/propagations`, payload);
  return data.data;
}

export interface ListPropagationsParams {
  page?: number;
  perPage?: number;
  lineId?: string;
  accessionId?: string;
  method?: string;
  mediumBatchId?: string;
}

export async function listPropagations(
  params: ListPropagationsParams = {}
): Promise<Paginated<PropagationEvent>> {
  const { data } = await apiClient.get(`${BASE}/propagations`, { params });
  return data;
}

// ============================================================================
// MEDIA
// ============================================================================

export interface ListRecipesParams {
  page?: number;
  perPage?: number;
  type?: string;
  additive?: string;
  search?: string;
  activeOnly?: boolean;
}

export async function listRecipes(
  params: ListRecipesParams = {}
): Promise<Paginated<MediumRecipe>> {
  const { data } = await apiClient.get(`${BASE}/media/recipes`, { params });
  return data;
}

export async function getRecipe(recipeId: string): Promise<MediumRecipe> {
  const { data } = await apiClient.get(`${BASE}/media/recipes/${recipeId}`);
  return data.data;
}

export async function createRecipe(payload: CreateRecipePayload): Promise<MediumRecipe> {
  const { data } = await apiClient.post(`${BASE}/media/recipes`, payload);
  return data.data;
}

export async function updateRecipe(
  recipeId: string,
  payload: UpdateRecipePayload
): Promise<MediumRecipe> {
  const { data } = await apiClient.patch(`${BASE}/media/recipes/${recipeId}`, payload);
  return data.data;
}

export interface ListBatchesParams {
  page?: number;
  perPage?: number;
  recipeId?: string;
  status?: string;
  additive?: string;
  search?: string;
}

export async function listBatches(
  params: ListBatchesParams = {}
): Promise<Paginated<MediumBatch>> {
  const { data } = await apiClient.get(`${BASE}/media/batches`, { params });
  return data;
}

export async function createBatch(payload: CreateBatchPayload): Promise<MediumBatch> {
  const { data } = await apiClient.post(`${BASE}/media/batches`, payload);
  return data.data;
}

export async function updateBatch(
  batchId: string,
  payload: UpdateBatchPayload
): Promise<MediumBatch> {
  const { data } = await apiClient.patch(`${BASE}/media/batches/${batchId}`, payload);
  return data.data;
}

/** Everything ever grown on a medium containing a given additive. */
export async function getAccessionsByAdditive(
  additiveName: string,
  params: { page?: number; perPage?: number } = {}
): Promise<AdditiveReadout> {
  const { data } = await apiClient.get(
    `${BASE}/media/additives/${encodeURIComponent(additiveName)}/accessions`,
    { params }
  );
  return data.data;
}

// ============================================================================
// OBSERVATIONS
// ============================================================================

export interface ListObservationsParams {
  page?: number;
  perPage?: number;
  accessionId?: string;
  lineId?: string;
  type?: string;
  novelOnly?: boolean;
}

export async function listObservations(
  params: ListObservationsParams = {}
): Promise<Paginated<Observation>> {
  const { data } = await apiClient.get(`${BASE}/observations`, { params });
  return data;
}

export async function createObservation(
  payload: CreateObservationPayload
): Promise<Observation> {
  const { data } = await apiClient.post(`${BASE}/observations`, payload);
  return data.data;
}

export async function promoteTrait(
  observationId: string,
  payload: PromoteTraitPayload
): Promise<PromotionResult> {
  const { data } = await apiClient.post(`${BASE}/observations/${observationId}/promote`, payload);
  return data.data;
}

// ============================================================================
// LINEAGE
// ============================================================================

export interface LineageGraphParams {
  accessionId?: string;
  lineId?: string;
  includeAncestors?: boolean;
  includeDescendants?: boolean;
  maxDepth?: number;
}

export async function getLineageGraph(params: LineageGraphParams): Promise<LineageGraph> {
  const { data } = await apiClient.get(`${BASE}/lineage/graph`, { params });
  return data.data;
}

export async function getAncestry(accessionId: string): Promise<AncestryChain> {
  const { data } = await apiClient.get(`${BASE}/lineage/ancestry/${accessionId}`);
  return data.data;
}

// ============================================================================
// DASHBOARD
// ============================================================================

export async function getGeneticsDashboard(): Promise<GeneticsDashboard> {
  const { data } = await apiClient.get(`${BASE}/dashboard`);
  return data.data;
}
