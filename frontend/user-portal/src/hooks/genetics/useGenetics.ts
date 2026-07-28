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

// ============================================================================
// ACCESSIONS
// ============================================================================

export function useAccessions(params: api.ListAccessionsParams = {}) {
  return useQuery<Paginated<Accession>>({
    queryKey: [...ROOT, 'accessions', params],
    queryFn: () => api.listAccessions(params),
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
// DASHBOARD
// ============================================================================

export function useGeneticsDashboard() {
  return useQuery<GeneticsDashboard>({
    queryKey: [...ROOT, 'dashboard'],
    queryFn: api.getGeneticsDashboard,
  });
}
