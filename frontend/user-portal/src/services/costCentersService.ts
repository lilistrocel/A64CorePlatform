/**
 * Cost Centres API Service
 *
 * Typed API calls for the Finance Cost Centres master data.
 * Endpoint: GET /api/v1/finance/cost-centers?organization_id={orgId}
 *
 * Reuses the shared apiClient (same axios instance, same JWT auth interceptor).
 * Finance endpoints are proxied via nginx on the same host — no separate base
 * URL needed. Consumers in purchasing forms use the optional `isActive`
 * filter applied client-side to drop archived cost centres from pickers.
 */

import { apiClient } from './api';

// ─── Shape ────────────────────────────────────────────────────────────────────

export type CostCenterType =
  | 'farm'
  | 'department'
  | 'project'
  | 'cost_pool'
  | 'other';

/**
 * A cost centre as returned by GET /api/v1/finance/cost-centers.
 *
 * Composite identity (organizationId, costCenterId) — costCenterId is the
 * business key used in JE tagging and on purchase document lines.
 */
export interface CostCenter {
  organizationId: string;
  costCenterId: string;
  companyCode: string | null;
  name: string;
  type: CostCenterType;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Finance success envelope (SuccessResponse<List[CostCenterResponse]>). */
interface CostCenterListResponse {
  data: CostCenter[];
}

// ─── API functions ────────────────────────────────────────────────────────────

/**
 * Fetch all cost centres for the given organisation.
 * Returns active and inactive entries — callers may filter on `isActive`
 * before rendering pickers.
 */
export async function listCostCenters(orgId: string): Promise<CostCenter[]> {
  const response = await apiClient.get<CostCenterListResponse>(
    '/v1/finance/cost-centers',
    { params: { organization_id: orgId } }
  );
  return response.data.data;
}
