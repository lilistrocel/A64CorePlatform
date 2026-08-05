/**
 * Goods Receipts API Service
 *
 * Typed API calls for the GR (Goods Receipt) module.
 * GRs are created from Open/Sent POs. On posting, PO openQuantity decrements
 * and a purchase_received event is emitted → finance creates a JE.
 *
 * All endpoints are under /api/v1/purchasing/gr.
 * Envelope conventions mirror purchasingApi.ts:
 *   - List:   response.data  (PaginatedResult<GoodsReceipt>)
 *   - Detail: response.data.data  (SuccessResult<GoodsReceiptDetail>)
 *   - Post:   response.data.data  (SuccessResult<GoodsReceiptDetail>)
 *   - Delete: 204 No Content
 */

import { apiClient } from './api';

// ============================================================================
// Types
// ============================================================================

// T-811: wave4_purchasing_status_migration.py collapsed GR's stored "Posted"
// into the shared 'open' value (same as PR/PO/AP's other non-draft states) —
// it displays as "Posted" for GR specifically via statusPhase.ts's
// statusDisplayLabel(). 'Draft'/'Posted' are kept as aliases only for
// documents left over from before the migration ran.
export type GRStatus = 'draft' | 'open' | 'Draft' | 'Posted';

/** A single GR line as it comes back from the backend */
export interface GRLine {
  grLineId: string;
  grDocId: string;
  organizationId: string;
  lineNumber: number;
  baseLineId: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  uom: string;
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  lineNet: number;
  costCenterId?: string | null;
  warehouseId?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** GR header as returned in paginated list */
export interface GoodsReceipt {
  docId: string;
  organizationId: string;
  docType: 'GR';
  docNumber: string;
  docDate: string;
  receivedDate: string;
  status: GRStatus;
  baseDocId: string;
  baseDocNumber?: string | null;
  vendorId?: string | null;
  vendorCode?: string | null;
  vendorName?: string | null;
  warehouseId?: string | null;
  subtotalNet: number;
  currencyCode: string;
  notes?: string | null;
  postedAt?: string | null;
  postedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Full GR detail with lines */
export interface GoodsReceiptDetail extends GoodsReceipt {
  lines: GRLine[];
}

/** Body for creating a GR from a specific PO */
export interface GRFromPOCreate {
  receivedDate: string;          // YYYY-MM-DD
  warehouseId?: string | null;
  notes?: string | null;
  lines: GRLineCreate[];
}

/** A line in the create payload */
export interface GRLineCreate {
  baseLineId: string;            // PO line's lineId
  quantity: number;              // must be > 0 and <= openQuantity
}

/** PATCH body for updating a Draft GR */
export interface GRUpdate {
  receivedDate?: string | null;
  warehouseId?: string | null;
  notes?: string | null;
  lines?: GRLineCreate[] | null;
}

/** Generic paginated response — same shape as purchasingApi.ts */
interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    perPage: number;
    totalPages: number;
  };
}

/** Generic single-item success envelope */
interface SuccessResult<T> {
  data: T;
  message?: string | null;
}

// ============================================================================
// API functions
// ============================================================================

/**
 * List GRs (paginated).
 * GET /api/v1/purchasing/gr?organization_id=…&status=…&search=…&page=…&per_page=…
 */
export async function getGoodsReceipts(params?: {
  organizationId?: string;
  page?: number;
  perPage?: number;
  status?: GRStatus;
  search?: string;
}): Promise<PaginatedResult<GoodsReceipt>> {
  const response = await apiClient.get<PaginatedResult<GoodsReceipt>>(
    '/v1/purchasing/gr',
    {
      params: {
        ...(params?.organizationId ? { organization_id: params.organizationId } : {}),
        ...(params?.page !== undefined ? { page: params.page } : {}),
        ...(params?.perPage !== undefined ? { per_page: params.perPage } : {}),
        ...(params?.status ? { status: params.status } : {}),
        ...(params?.search ? { search: params.search } : {}),
      },
    }
  );
  return response.data;
}

/**
 * Get a single GR by docId.
 * GET /api/v1/purchasing/gr/{docId}?organization_id=…
 */
export async function getGoodsReceipt(
  docId: string,
  organizationId?: string
): Promise<GoodsReceiptDetail> {
  const response = await apiClient.get<SuccessResult<GoodsReceiptDetail>>(
    `/v1/purchasing/gr/${docId}`,
    { params: organizationId ? { organization_id: organizationId } : undefined }
  );
  return response.data.data;
}

/**
 * Create a GR from a PO.
 * POST /api/v1/purchasing/gr/from-po/{poDocId}?organization_id=…
 */
export async function createGoodsReceiptFromPO(
  poDocId: string,
  data: GRFromPOCreate,
  organizationId?: string
): Promise<GoodsReceiptDetail> {
  const response = await apiClient.post<SuccessResult<GoodsReceiptDetail>>(
    `/v1/purchasing/gr/from-po/${poDocId}`,
    data,
    { params: organizationId ? { organization_id: organizationId } : undefined }
  );
  return response.data.data;
}

/**
 * Update a Draft GR.
 * PATCH /api/v1/purchasing/gr/{docId}?organization_id=…
 */
export async function updateGoodsReceipt(
  docId: string,
  data: GRUpdate,
  organizationId?: string
): Promise<GoodsReceiptDetail> {
  const response = await apiClient.patch<SuccessResult<GoodsReceiptDetail>>(
    `/v1/purchasing/gr/${docId}`,
    data,
    { params: organizationId ? { organization_id: organizationId } : undefined }
  );
  return response.data.data;
}

/**
 * Post a Draft GR — status flips Draft → Posted, PO openQuantity decrements.
 * POST /api/v1/purchasing/gr/{docId}/post?organization_id=…
 */
export async function postGoodsReceipt(
  docId: string,
  organizationId?: string
): Promise<GoodsReceiptDetail> {
  const response = await apiClient.post<SuccessResult<GoodsReceiptDetail>>(
    `/v1/purchasing/gr/${docId}/post`,
    {},
    { params: organizationId ? { organization_id: organizationId } : undefined }
  );
  return response.data.data;
}

/**
 * Delete a Draft GR.
 * DELETE /api/v1/purchasing/gr/{docId}?organization_id=…
 * Returns 204 No Content.
 */
export async function deleteGoodsReceipt(
  docId: string,
  organizationId?: string
): Promise<void> {
  await apiClient.delete(`/v1/purchasing/gr/${docId}`, {
    params: organizationId ? { organization_id: organizationId } : undefined,
  });
}
