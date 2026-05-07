/**
 * Fertilizer Cost Calculator & Chemicals Catalog — TypeScript Types
 *
 * These types mirror the backend Pydantic models served at /api/v1/farm/tools/.
 */

// ─── Chemicals ───────────────────────────────────────────────────────────────

export type ChemicalUnit = 'kg' | 'L';

export interface FertilizerChemical {
  chemicalId: string;
  name: string;
  aliases: string[];
  category: string;
  defaultUnit: ChemicalUnit;
  notes?: string;
  archivedAt?: string | null;
}

export interface CreateChemicalRequest {
  name: string;
  aliases: string[];
  category: string;
  defaultUnit: ChemicalUnit;
  notes?: string;
}

export interface UpdateChemicalRequest extends Partial<CreateChemicalRequest> {
  /** Pass null to unarchive a chemical (PATCH endpoint accepts {archivedAt: null}). */
  archivedAt?: string | null;
}

/** 409 payload when trying to delete a referenced chemical */
export interface ChemicalDependentsError {
  dependents: Array<{ plantDataId: string; plantName: string }>;
}

// ─── Prices ──────────────────────────────────────────────────────────────────

export type PriceSource = 'override' | 'inventory' | 'none';

export interface ChemicalPriceEntry {
  chemical: FertilizerChemical;
  price?: number;
  source: PriceSource;
}

export interface UpdatePriceRequest {
  price: number;
}

// ─── Calculation ─────────────────────────────────────────────────────────────

export interface CalculateItem {
  plantDataId: string;
  points: number;
}

export interface CalculateRequest {
  items: CalculateItem[];
}

export interface IngredientLine {
  chemicalId: string;
  name: string;
  qty: number;
  unit: ChemicalUnit;
  unitPrice?: number;
  totalCost?: number;
}

export interface CropCalculationResult {
  plantDataId: string;
  plantName: string;
  points: number;
  cycleDays: number;
  ingredients: IngredientLine[];
  subtotalCost?: number;
}

export interface CalculateResponse {
  perCrop: CropCalculationResult[];
  grandTotalCost?: number;
  warnings: string[];
  discoveredChemicals: FertilizerChemical[];
}

// ─── Excel Import / Export ────────────────────────────────────────────────────

export interface ImportSkippedRow {
  rowIndex: number;
  name: string;
  reason: string;
}

export interface ImportResponse {
  items: Array<{ plantDataId: string; plantName: string; points: number }>;
  skipped: ImportSkippedRow[];
  warnings: string[];
}

// ─── Saved Lists ─────────────────────────────────────────────────────────────

export interface SavedList {
  listId: string;
  name: string;
  items: CalculateItem[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateSavedListRequest {
  name: string;
  items: CalculateItem[];
}

export type UpdateSavedListRequest = Partial<CreateSavedListRequest>;

// ─── UI-only: Crop typeahead entry ───────────────────────────────────────────

export interface CropOption {
  plantDataId: string;
  plantName: string;
  /** true if fertigationSchedule exists; false → show disabled */
  hasFertigationSchedule: boolean;
}

/** Row in the Crop List panel before calculation */
export interface CropListRow extends CropOption {
  points: number;
}
