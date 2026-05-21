/**
 * Item GL Account Mapping Service
 *
 * Typed API calls for the finance/master-data/purchase-items endpoints.
 * These extend the operational purchase item master with GL account assignments
 * used by the posting engine when goods receipts generate journal entries.
 *
 * Endpoints:
 *   GET    /api/v1/finance/master-data/purchase-items
 *   GET    /api/v1/finance/master-data/purchase-items/{itemId}
 *   PATCH  /api/v1/finance/master-data/purchase-items/{itemId}
 *
 * The backend uses snake_case query params; this service translates camelCase inputs.
 */

import { apiClient } from './api';

// ─── Types ─────────────────────────────────────────────────────────────────────

/** Item type enum matching the backend purchase_item_finance_ext.item_type column. */
export type PurchaseItemType =
  | 'raw_material'
  | 'consumable'
  | 'service'
  | 'fixed_asset_acquisition'
  | null;

/** Valuation method enum — must match backend ValuationMethodEnum. */
export type ValuationMethod = 'MovingAverage' | 'Standard' | 'FIFO';

/**
 * Finance extension row for a purchase item.
 * Mirrors backend `PurchaseItemFinanceExt` Pydantic schema (camelCase).
 */
export interface PurchaseItemFinanceExt {
  extId: string;
  organizationId: string;
  itemId: string;
  itemCode: string;
  /** Denormalised from the operational item record. */
  itemName: string | null;
  itemType: PurchaseItemType;
  inventoryAccountId: string | null;
  cogsAccountId: string | null;
  allocationAccountId: string | null;
  valuationMethod: ValuationMethod;
  taxCodeDefault: string | null;
  ifrsTag: string | null;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Query params accepted by the list endpoint. */
export interface ListItemMappingsParams {
  organizationId: string;
  itemType?: PurchaseItemType;
  isActive?: boolean;
  search?: string;
  page?: number;
  size?: number;
}

/**
 * Paginated response wrapper (matches backend `PaginatedResponse<T>`).
 */
export interface PaginatedItemMappingsResponse {
  items: PurchaseItemFinanceExt[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

/** Backend single-item success wrapper. */
interface SuccessResponse<T> {
  data: T;
  success: boolean;
  message?: string;
}

/**
 * Fields that can be updated via PATCH.
 * All optional.
 *
 * NOTE: `valuationMethod` is intentionally excluded here — per IAS 2 and PM feedback
 * item 11, the valuation method is now set at the company level on PostingSetupPage.
 * The field is kept on PurchaseItemFinanceExt so existing data deserialises without
 * error, but the UI no longer surfaces or edits it per item.
 */
export interface UpdateItemMappingBody {
  inventoryAccountId?: string | null;
  cogsAccountId?: string | null;
  allocationAccountId?: string | null;
  taxCodeDefault?: string | null;
  ifrsTag?: string | null;
  notes?: string | null;
}

// ─── API functions ─────────────────────────────────────────────────────────────

/**
 * Fetch the paginated list of purchase items with their finance GL mappings.
 * Uses page size 200 by default — sufficient for all operational purchase items
 * (typical catalogues are 10–80 items; 200 gives ample headroom).
 */
export async function listItemMappings(
  orgId: string,
  params: Omit<ListItemMappingsParams, 'organizationId'> = {},
): Promise<PaginatedItemMappingsResponse> {
  const queryParams: Record<string, string | number | boolean> = {
    organization_id: orgId,
    page: params.page ?? 1,
    size: params.size ?? 200,
  };

  if (params.itemType != null) queryParams.item_type = params.itemType;
  if (params.isActive !== undefined) queryParams.is_active = params.isActive;
  if (params.search) queryParams.search = params.search;

  const response = await apiClient.get<PaginatedItemMappingsResponse>(
    '/v1/finance/master-data/purchase-items',
    { params: queryParams },
  );
  return response.data;
}

/**
 * Fetch a single purchase item finance extension by item ID.
 */
export async function getItemMapping(
  orgId: string,
  itemId: string,
): Promise<PurchaseItemFinanceExt> {
  const response = await apiClient.get<SuccessResponse<PurchaseItemFinanceExt>>(
    `/v1/finance/master-data/purchase-items/${itemId}`,
    { params: { organization_id: orgId } },
  );
  return response.data.data;
}

/**
 * Partially update the GL account mapping for a purchase item.
 * Only the fields supplied in `body` are changed.
 */
export async function updateItemMapping(
  orgId: string,
  itemId: string,
  body: UpdateItemMappingBody,
): Promise<PurchaseItemFinanceExt> {
  const response = await apiClient.patch<SuccessResponse<PurchaseItemFinanceExt>>(
    `/v1/finance/master-data/purchase-items/${itemId}`,
    body,
    { params: { organization_id: orgId } },
  );
  return response.data.data;
}
