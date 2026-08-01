/**
 * Genetics Repo Hooks
 *
 * TanStack Query hooks over geneticsApi. Mutations invalidate broadly on
 * purpose: a propagation touches lines, accessions, lineage and the dashboard
 * at once, and the repo is small enough that precision invalidation would cost
 * more in bugs than it saves in requests.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '../../services/geneticsApi';
import type {
  Accession,
  AncestryChain,
  CascadePurgeResult,
  CreateAccessionPayload,
  CreateBatchPayload,
  CreateLinePayload,
  CreateObservationPayload,
  CreatePropagationPayload,
  CreateRecipePayload,
  GeneticLine,
  GeneticsDashboard,
  LineageGraph,
  LineDependents,
  LinkedProfileCounts,
  MediumBatch,
  MediumRecipe,
  MethodInfo,
  Observation,
  OrphanRecords,
  Paginated,
  PlainPurgeResult,
  PromoteTraitPayload,
  PromotionResult,
  PropagationAmendPayload,
  PropagationAmendResult,
  PropagationEvent,
  PropagationOutcome,
  PurgeLineParams,
  RoomOccupancy,
  SplitAccessionPayload,
  SplitResult,
  UpdateAccessionPayload,
  UpdateBatchPayload,
  UpdateLinePayload,
  UpdateRecipePayload,
} from '../../types/genetics';

const ROOT = ['genetics'] as const;

/** Invalidate everything under the genetics root. */
function useInvalidateGenetics() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ROOT });
}

// ============================================================================
// LINES
// ============================================================================

export function useGeneticLines(params: api.ListLinesParams = {}) {
  return useQuery<Paginated<GeneticLine>>({
    queryKey: [...ROOT, 'lines', params],
    queryFn: () => api.listLines(params),
  });
}

export function useGeneticLine(lineId: string | undefined) {
  return useQuery<GeneticLine>({
    queryKey: [...ROOT, 'lines', lineId],
    queryFn: () => api.getLine(lineId as string),
    enabled: !!lineId,
  });
}

/**
 * Line counts per linked growing profile, for the Strain / Plant library
 * reverse link. Cheap and rarely changing, so it tolerates a long stale time.
 */
export function useLinkedProfileCounts() {
  return useQuery<LinkedProfileCounts>({
    queryKey: [...ROOT, 'linked-counts'],
    queryFn: api.getLinkedProfileCounts,
    staleTime: 60_000,
  });
}

export function useCreateLine() {
  const invalidate = useInvalidateGenetics();
  return useMutation<GeneticLine, Error, CreateLinePayload>({
    mutationFn: api.createLine,
    onSuccess: invalidate,
  });
}

export function useUpdateLine(lineId: string) {
  const invalidate = useInvalidateGenetics();
  return useMutation<GeneticLine, Error, UpdateLinePayload>({
    mutationFn: (payload) => api.updateLine(lineId, payload),
    onSuccess: invalidate,
  });
}

/** Soft-delete — sets isActive: false, keeps the document and its history. */
export function useDeactivateLine(lineId: string) {
  const invalidate = useInvalidateGenetics();
  return useMutation<GeneticLine, Error, void>({
    mutationFn: () => api.deactivateLine(lineId),
    onSuccess: invalidate,
  });
}

/** What would block (or be destroyed by) purging this line. */
export function useLineDependents(lineId: string | undefined) {
  return useQuery<LineDependents>({
    queryKey: [...ROOT, 'lines', lineId, 'dependents'],
    queryFn: () => api.getLineDependents(lineId as string),
    enabled: !!lineId,
  });
}

/**
 * Hard-delete a line — zero-dependents purge by default, or (with
 * `cascade: true`) the confirmed/dry-runnable cascade escalation. See
 * `api.purgeLine`'s docstring; RemoveLineModal is the sole consumer and
 * drives every branch through this one mutation.
 */
export function usePurgeLine(lineId: string) {
  const queryClient = useQueryClient();
  return useMutation<PlainPurgeResult | CascadePurgeResult, Error, PurgeLineParams | undefined>({
    mutationFn: (params) => api.purgeLine(lineId, params),
    onSuccess: () => {
      // The line itself is gone. RemoveLineModal navigates away only
      // *after* this resolves, so the detail page underneath (and this
      // modal) are still mounted with active observers for exactly this
      // lineId at the instant this runs — useGeneticLine(lineId) and
      // useLineDependents(lineId). A plain broad invalidateQueries()
      // refetches every *active* observer under the root, and an active
      // observer for a query removeQueries() just evicted refetches
      // immediately too (it has no cached data left to serve) — either way
      // that refetch 404s against a line that no longer exists, surfacing a
      // scary "not found" toast right after a successful delete. Exclude
      // this line's own key (and its /dependents sub-query, same prefix)
      // from the invalidation instead: its last-known data simply goes
      // stale and unmounts with the page a moment later, never refetched.
      // Everything else under the genetics root still gets the normal
      // broad invalidate.
      queryClient.invalidateQueries({
        queryKey: ROOT,
        predicate: (query) =>
          !(query.queryKey[1] === 'lines' && query.queryKey[2] === lineId),
      });
    },
  });
}

// ============================================================================
// ACCESSIONS
// ============================================================================

export function useAccessions(params: api.ListAccessionsParams = {}) {
  return useQuery<Paginated<Accession>>({
    queryKey: [...ROOT, 'accessions', params],
    queryFn: () => api.listAccessions(params),
  });
}

/**
 * What is physically held in each room of a facility. Cheap and read-mostly,
 * so it tolerates a short stale window.
 */
export function useRoomOccupancy(facilityId?: string) {
  return useQuery<Record<string, RoomOccupancy>>({
    queryKey: [...ROOT, 'room-occupancy', facilityId],
    queryFn: () => api.getRoomOccupancy(facilityId),
    staleTime: 30_000,
  });
}

export function useAccession(accessionId: string | undefined) {
  return useQuery<Accession>({
    queryKey: [...ROOT, 'accessions', accessionId],
    queryFn: () => api.getAccession(accessionId as string),
    enabled: !!accessionId,
  });
}

export function useAccessionChildren(accessionId: string | undefined) {
  return useQuery<Accession[]>({
    queryKey: [...ROOT, 'accessions', accessionId, 'children'],
    queryFn: () => api.getAccessionChildren(accessionId as string),
    enabled: !!accessionId,
  });
}

export function useCreateAccession() {
  const invalidate = useInvalidateGenetics();
  return useMutation<Accession, Error, CreateAccessionPayload>({
    mutationFn: api.createAccession,
    onSuccess: invalidate,
  });
}

export function useUpdateAccession(accessionId: string) {
  const invalidate = useInvalidateGenetics();
  return useMutation<Accession, Error, UpdateAccessionPayload>({
    mutationFn: (payload) => api.updateAccession(accessionId, payload),
    onSuccess: invalidate,
  });
}

export function useSplitAccession(accessionId: string) {
  const invalidate = useInvalidateGenetics();
  return useMutation<SplitResult, Error, SplitAccessionPayload>({
    mutationFn: (payload) => api.splitAccession(accessionId, payload),
    onSuccess: invalidate,
  });
}

/**
 * Label PDF generation (T-804 §5.1). A GET in verb but not in effect — a
 * successful call raises `labelledVesselCount` server-side, so it goes
 * through `useMutation` (like every other genetics write in this file) and
 * invalidates broadly on success so the accession detail page's own
 * `useAccession` refetches the new high-water mark.
 */
export function useGetLabelsPdf(accessionId: string) {
  const invalidate = useInvalidateGenetics();
  return useMutation<api.LabelsPdfResult, Error, api.GetLabelsPdfParams>({
    mutationFn: (params) => api.getLabelsPdf(accessionId, params),
    onSuccess: invalidate,
  });
}

// ============================================================================
// PROPAGATIONS
// ============================================================================

/**
 * Method catalogue with each method's generation effects. Static for the
 * session, so it is cached aggressively — it drives the clone/cross form's
 * live "what will this produce" preview.
 */
export function usePropagationMethods() {
  return useQuery<MethodInfo[]>({
    queryKey: [...ROOT, 'propagation-methods'],
    queryFn: api.listPropagationMethods,
    staleTime: Infinity,
  });
}

export function usePropagations(params: api.ListPropagationsParams = {}) {
  return useQuery<Paginated<PropagationEvent>>({
    queryKey: [...ROOT, 'propagations', params],
    queryFn: () => api.listPropagations(params),
  });
}

export function useCreatePropagation() {
  const invalidate = useInvalidateGenetics();
  return useMutation<PropagationOutcome, Error, CreatePropagationPayload>({
    mutationFn: api.createPropagation,
    onSuccess: invalidate,
  });
}

/** Correct a propagation event's `performedAt`. See `api.amendPropagation`'s
 * docstring for the cascade semantics. */
export function useAmendPropagation(eventId: string) {
  const invalidate = useInvalidateGenetics();
  return useMutation<PropagationAmendResult, Error, PropagationAmendPayload>({
    mutationFn: (payload) => api.amendPropagation(eventId, payload),
    onSuccess: invalidate,
  });
}

// ============================================================================
// MEDIA
// ============================================================================

export function useMediumRecipes(params: api.ListRecipesParams = {}) {
  return useQuery<Paginated<MediumRecipe>>({
    queryKey: [...ROOT, 'recipes', params],
    queryFn: () => api.listRecipes(params),
  });
}

export function useCreateRecipe() {
  const invalidate = useInvalidateGenetics();
  return useMutation<MediumRecipe, Error, CreateRecipePayload>({
    mutationFn: api.createRecipe,
    onSuccess: invalidate,
  });
}

export function useUpdateRecipe(recipeId: string) {
  const invalidate = useInvalidateGenetics();
  return useMutation<MediumRecipe, Error, UpdateRecipePayload>({
    mutationFn: (payload) => api.updateRecipe(recipeId, payload),
    onSuccess: invalidate,
  });
}

export function useMediumBatches(params: api.ListBatchesParams = {}) {
  return useQuery<Paginated<MediumBatch>>({
    queryKey: [...ROOT, 'batches', params],
    queryFn: () => api.listBatches(params),
  });
}

export function useCreateBatch() {
  const invalidate = useInvalidateGenetics();
  return useMutation<MediumBatch, Error, CreateBatchPayload>({
    mutationFn: api.createBatch,
    onSuccess: invalidate,
  });
}

export function useUpdateBatch(batchId: string) {
  const invalidate = useInvalidateGenetics();
  return useMutation<MediumBatch, Error, UpdateBatchPayload>({
    mutationFn: (payload) => api.updateBatch(batchId, payload),
    onSuccess: invalidate,
  });
}

export function useAccessionsByAdditive(additiveName: string | undefined) {
  return useQuery({
    queryKey: [...ROOT, 'additive-readout', additiveName],
    queryFn: () => api.getAccessionsByAdditive(additiveName as string),
    enabled: !!additiveName,
  });
}

// ============================================================================
// OBSERVATIONS
// ============================================================================

export function useObservations(params: api.ListObservationsParams = {}) {
  return useQuery<Paginated<Observation>>({
    queryKey: [...ROOT, 'observations', params],
    queryFn: () => api.listObservations(params),
  });
}

export function useCreateObservation() {
  const invalidate = useInvalidateGenetics();
  return useMutation<Observation, Error, CreateObservationPayload>({
    mutationFn: api.createObservation,
    onSuccess: invalidate,
  });
}

export function usePromoteTrait() {
  const invalidate = useInvalidateGenetics();
  return useMutation<
    PromotionResult,
    Error,
    { observationId: string; payload: PromoteTraitPayload }
  >({
    mutationFn: ({ observationId, payload }) => api.promoteTrait(observationId, payload),
    onSuccess: invalidate,
  });
}

// ============================================================================
// LINEAGE
// ============================================================================

export function useLineageGraph(params: api.LineageGraphParams) {
  const enabled = !!(params.accessionId || params.lineId);
  return useQuery<LineageGraph>({
    queryKey: [...ROOT, 'lineage', params],
    queryFn: () => api.getLineageGraph(params),
    enabled,
  });
}

export function useAncestry(accessionId: string | undefined) {
  return useQuery<AncestryChain>({
    queryKey: [...ROOT, 'ancestry', accessionId],
    queryFn: () => api.getAncestry(accessionId as string),
    enabled: !!accessionId,
  });
}

// ============================================================================
// MAINTENANCE — org-wide orphan sweep (T-809), not line-scoped. super_admin.
// ============================================================================

/**
 * @param enabled Pass the caller's own super_admin check — GET /orphans
 * itself only requires curation tier (genetics.delete), but every other
 * consumer of this sweep is super_admin-gated (T-809), and firing it
 * unconditionally from a page every authenticated user can open (Settings)
 * would 403 for everyone below moderator on every page load.
 */
export function useOrphans(enabled: boolean = true) {
  return useQuery<OrphanRecords>({
    queryKey: [...ROOT, 'maintenance', 'orphans'],
    queryFn: api.getOrphans,
    enabled,
  });
}

export function useDeleteOrphans() {
  const invalidate = useInvalidateGenetics();
  return useMutation<OrphanRecords, Error, { dryRun?: boolean } | undefined>({
    mutationFn: (params) => api.deleteOrphans(params),
    onSuccess: invalidate,
  });
}

// ============================================================================
// DASHBOARD
// ============================================================================

export function useGeneticsDashboard() {
  return useQuery<GeneticsDashboard>({
    queryKey: [...ROOT, 'dashboard'],
    queryFn: api.getGeneticsDashboard,
  });
}
