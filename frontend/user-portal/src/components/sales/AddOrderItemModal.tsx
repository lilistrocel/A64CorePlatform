/**
 * AddOrderItemModal
 *
 * FIFO-aware item picker for the sales-order form (Phase 2 of the
 * sales-order ↔ stock work).  Pulls availability from both
 * `inventory_harvest` and `inventory_returned`, groups farm batches,
 * and supports kg-mode and container-mode input.
 *
 * Design constraints (enforced):
 *  - Modal never closes on overlay click — only via X or Cancel.
 *  - Returns stock is never auto-filled (user must explicitly enter a quantity).
 *  - Per-batch FIFO split: farm "Take" amount is distributed across
 *    underlying harvest rows oldest-first to preserve per-batch traceability.
 *  - Container-size preference is persisted per-plantName in localStorage.
 *  - Greyed-out/disabled crop options for zero-stock crops are visible but
 *    not selectable.
 *  - Duplicate crop+grade detection with inline merge prompt.
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useId,
  useMemo,
} from 'react';
import { createPortal } from 'react-dom';
import styled, { css } from 'styled-components';
import { listHarvestInventory, listReturnedInventory } from '../../services/inventoryApi';
import { getFarms } from '../../services/farmApi';
import type { HarvestInventory } from '../../types/inventory';
import type { ReturnedInventory } from '../../types/inventory';
import type { OrderItem, OrderItemAllocation } from '../../types/sales';

// ============================================================================
// CONSTANTS
// ============================================================================

const GRADES = ['A', 'B', 'C'] as const;
type Grade = typeof GRADES[number];

// Maps UI grade label to backend QualityGrade value.
const GRADE_TO_BACKEND: Record<Grade, string> = {
  A: 'grade_a',
  B: 'grade_b',
  C: 'grade_c',
};

const DEBOUNCE_MS = 250;

/** LocalStorage key for container-size memory. Scoped per plant name. */
function containerSizeKey(plantName: string): string {
  return `addOrderItem.containerSize.${plantName}`;
}

// ============================================================================
// INTERNAL TYPES
// ============================================================================

/** Aggregated view of all harvest rows for a single farm. */
interface FarmBatch {
  farmId: string;
  farmName: string;
  totalAvailableKg: number;
  oldestHarvestDate: string;
  earliestExpiryDate: string | null;
  /** The underlying harvest rows, sorted harvest-date ASC (for FIFO split). */
  rows: HarvestInventory[];
}

/** User's current "take" amount for a farm batch. */
interface FarmTakeRow {
  farmId: string;
  takeKg: number;
}

/** User's current "take" amount for a returned-inventory row. */
interface ReturnedTakeRow {
  inventoryId: string;
  takeKg: number;
}

// ============================================================================
// PROPS
// ============================================================================

export interface AddOrderItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called when the user confirms the new line item. */
  onAdd: (item: OrderItem) => void;
  /** Existing draft-order items — used to detect crop+grade duplicates. */
  existingItems: OrderItem[];
}

// ============================================================================
// HELPERS
// ============================================================================

/** Format an ISO date string to a short localised display (DD MMM YYYY). */
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

/** Convert backend QualityGrade enum to a UI grade label. */
function backendGradeToLabel(grade: string): Grade | null {
  for (const g of GRADES) {
    if (GRADE_TO_BACKEND[g] === grade) return g;
  }
  return null;
}

/**
 * Walk the farm's underlying harvest rows in FIFO order (oldest harvestDate
 * first) and produce one `OrderItemAllocation` per row consumed.
 */
function splitAcrossHarvestRows(
  farmBatch: FarmBatch,
  takeKg: number,
  farmName: string,
): OrderItemAllocation[] {
  const allocations: OrderItemAllocation[] = [];
  let remaining = takeKg;

  // Rows are already sorted ASC by harvestDate.
  for (const row of farmBatch.rows) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, row.availableQuantity);
    if (take <= 0) continue;
    allocations.push({
      inventorySource: 'harvest',
      inventoryId: row.inventoryId,
      farmId: row.farmId,
      farmName,
      quantity: take,
    });
    remaining -= take;
  }

  return allocations;
}

// ============================================================================
// STYLED COMPONENTS — all transient props use $ prefix per project rules.
// ============================================================================

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(2px);
  z-index: 1100;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 24px 16px;
  overflow-y: auto;

  @media (max-width: 480px) {
    padding: 16px 8px;
  }
`;

const ModalBox = styled.div`
  background: ${({ theme }) => theme.colors.surface.canvas};
  border-radius: 12px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.18);
  width: 100%;
  max-width: 720px;
  display: flex;
  flex-direction: column;
  overflow: hidden;

  @media (max-width: 480px) {
    border-radius: 8px;
  }
`;

const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.surface.sunken};
  flex-shrink: 0;
`;

const ModalTitle = styled.h2`
  font-size: 18px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.primary};
  margin: 0;
`;

const CloseButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: ${({ theme }) => theme.colors.text.secondary};
  font-size: 20px;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  line-height: 1;

  &:hover {
    background: ${({ theme }) => theme.colors.surface.raised};
    color: ${({ theme }) => theme.colors.text.primary};
  }

  &:focus-visible {
    outline: 2px solid #0F6E56;
    outline-offset: 2px;
  }
`;

const ModalBody = styled.div`
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  overflow-y: auto;
  max-height: calc(90vh - 140px);

  @media (max-width: 480px) {
    padding: 16px;
  }
`;

const ModalFooter = styled.div`
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  padding: 16px 24px;
  border-top: 1px solid ${({ theme }) => theme.colors.surface.sunken};
  flex-shrink: 0;

  @media (max-width: 480px) {
    padding: 12px 16px;
  }
`;

// ---- Section labels ----
const SectionLabel = styled.label`
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.secondary};
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

// ---- Crop typeahead ----
const ComboWrapper = styled.div`
  position: relative;
`;

const ComboInput = styled.input<{ $hasError?: boolean }>`
  width: 100%;
  padding: 10px 14px;
  border: 1px solid ${({ $hasError, theme }) => ($hasError ? '#9E2A2A' : theme.colors.border.subtle)};
  border-radius: 8px;
  font-size: 14px;
  background: ${({ theme }) => theme.colors.surface.canvas};
  color: ${({ theme }) => theme.colors.text.primary};
  box-sizing: border-box;
  transition: border-color 150ms ease-in-out, box-shadow 150ms ease-in-out;

  &::placeholder {
    color: ${({ theme }) => theme.colors.text.tertiary};
  }

  &:focus {
    outline: none;
    border-color: #0F6E56;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
`;

/* Portaled to document.body so the modal's overflow:hidden + max-height
   can't clip it. Positioned via fixed + the input's bounding rect, computed
   each time the dropdown opens or the layout shifts. Mobile-safe: max-height
   capped, and flips above the input when there's no room below. */
const Dropdown = styled.ul<{
  $top: number;
  $left: number;
  $width: number;
  $maxHeight: number;
  $flipUp?: boolean;
}>`
  position: fixed;
  top: ${({ $top }) => $top}px;
  left: ${({ $left }) => $left}px;
  width: ${({ $width }) => $width}px;
  max-height: ${({ $maxHeight }) => $maxHeight}px;
  background: ${({ theme }) => theme.colors.surface.canvas};
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  overflow-y: auto;
  z-index: 1300;
  list-style: none;
  margin: 0;
  padding: 4px 0;
  ${({ $flipUp }) =>
    $flipUp &&
    css`
      transform: translateY(0);
    `}
`;

const DropdownItem = styled.li<{ $highlighted?: boolean; $disabled?: boolean }>`
  padding: 10px 14px;
  cursor: ${({ $disabled }) => ($disabled ? 'not-allowed' : 'pointer')};
  background: ${({ $highlighted, theme }) =>
    $highlighted ? theme.colors.surface.canvas : 'transparent'};
  opacity: ${({ $disabled }) => ($disabled ? 0.45 : 1)};
  display: flex;
  flex-direction: column;
  gap: 2px;
  transition: background 80ms ease-in-out;
  pointer-events: ${({ $disabled }) => ($disabled ? 'none' : 'auto')};

  &:hover {
    background: ${({ $disabled, theme }) => ($disabled ? 'transparent' : theme.colors.surface.canvas)};
  }
`;

const CropName = styled.strong`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text.primary};
`;

const CropMeta = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.text.secondary};
`;

const DropdownStatus = styled.li`
  padding: 14px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.secondary};
  text-align: center;
`;

const SelectedCropChip = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 14px;
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: 8px;
  background: ${({ theme }) => theme.colors.surface.raised};
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text.primary};
  font-weight: 500;
`;

const ChipClearButton = styled.button`
  border: none;
  background: transparent;
  color: ${({ theme }) => theme.colors.text.secondary};
  font-size: 18px;
  cursor: pointer;
  line-height: 1;
  padding: 0 2px;
  border-radius: 4px;
  flex-shrink: 0;

  &:hover {
    color: #9E2A2A;
  }

  &:focus-visible {
    outline: 2px solid #9E2A2A;
    outline-offset: 2px;
  }
`;

// ---- Grade chips ----
const GradeRow = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`;

const GradeChip = styled.button<{ $selected?: boolean; $disabled?: boolean }>`
  padding: 6px 16px;
  border-radius: 9999px;
  font-size: 13px;
  font-weight: 600;
  cursor: ${({ $disabled }) => ($disabled ? 'not-allowed' : 'pointer')};
  border: 2px solid ${({ $selected }) => ($selected ? '#0F6E56' : 'transparent')};
  background: ${({ $selected, $disabled, theme }) => {
    if ($disabled) return theme.colors.surface.raised;
    if ($selected) return 'rgba(15,110,86,0.05)';
    return theme.colors.surface.raised;
  }};
  color: ${({ $selected, $disabled, theme }) => {
    if ($disabled) return theme.colors.text.tertiary;
    if ($selected) return '#0B5644';
    return theme.colors.text.secondary;
  }};
  opacity: ${({ $disabled }) => ($disabled ? 0.5 : 1)};
  transition: all 150ms ease-in-out;

  &:hover:not(:disabled) {
    border-color: ${({ $disabled }) => ($disabled ? 'transparent' : '#0F6E56')};
  }

  &:focus-visible {
    outline: 2px solid #0F6E56;
    outline-offset: 2px;
  }
`;

// ---- Mode segmented control ----
const SegmentedControl = styled.div`
  display: inline-flex;
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: 8px;
  overflow: hidden;
  align-self: flex-start;
`;

const Segment = styled.button<{ $active?: boolean }>`
  padding: 7px 18px;
  font-size: 13px;
  font-weight: 500;
  border: none;
  cursor: pointer;
  background: ${({ $active, theme }) => ($active ? '#0F6E56' : theme.colors.surface.canvas)};
  color: ${({ $active, theme }) => ($active ? '#fff' : theme.colors.text.secondary)};
  transition: background 150ms ease-in-out, color 150ms ease-in-out;

  &:focus-visible {
    outline: 2px solid #0F6E56;
    outline-offset: -2px;
  }
`;

// ---- Container math row ----
const ContainerMathRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  background: ${({ theme }) => theme.colors.surface.canvas};
  border: 1px solid ${({ theme }) => theme.colors.surface.sunken};
  border-radius: 8px;
  padding: 12px 16px;
`;

const MathLabel = styled.span`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.secondary};
`;

const SmallNumInput = styled.input`
  width: 80px;
  padding: 6px 10px;
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: 6px;
  font-size: 14px;
  background: ${({ theme }) => theme.colors.surface.canvas};
  color: ${({ theme }) => theme.colors.text.primary};
  text-align: right;

  &:focus {
    outline: none;
    border-color: #0F6E56;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
  }
`;

const MathResult = styled.span`
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.primary};
`;

// ---- Auto-fill row ----
const AutoFillRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
`;

const AutoFillButton = styled.button`
  padding: 7px 14px;
  background: #0F6E56;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: background 150ms ease-in-out;

  &:hover {
    background: #0B5644;
  }

  &:focus-visible {
    outline: 2px solid #0F6E56;
    outline-offset: 2px;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const InfoTip = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.text.secondary};
  font-style: italic;
`;

const NeedInput = styled(SmallNumInput)`
  width: 100px;
`;

// ---- Per-source panels ----
const Panel = styled.div`
  border: 1px solid ${({ theme }) => theme.colors.surface.sunken};
  border-radius: 8px;
  overflow: hidden;
`;

const PanelHeading = styled.div`
  padding: 10px 16px;
  background: ${({ theme }) => theme.colors.surface.canvas};
  border-bottom: 1px solid ${({ theme }) => theme.colors.surface.sunken};
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.secondary};
  text-transform: uppercase;
  letter-spacing: 0.4px;
`;

const SourceRow = styled.div`
  padding: 12px 16px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.surface.raised};
  display: flex;
  flex-direction: column;
  gap: 4px;

  &:last-child {
    border-bottom: none;
  }
`;

const SourceRowHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;

  @media (max-width: 480px) {
    flex-direction: column;
  }
`;

const FarmRowName = styled.span`
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text.primary};
  display: flex;
  align-items: center;
  gap: 6px;
`;

const RecommendedBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  font-weight: 600;
  color: #D97706;
  background: rgba(184,132,42,0.10);
  border: 1px solid #FCD34D;
  border-radius: 4px;
  padding: 1px 6px;
`;

const AvailBadge = styled.span`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.secondary};
  white-space: nowrap;
`;

const SourceMeta = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.text.secondary};
`;

const TakeInputRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;

  @media (max-width: 480px) {
    flex-wrap: wrap;
  }
`;

const TakeLabel = styled.label`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.secondary};
  white-space: nowrap;
`;

const TakeInput = styled.input<{ $hasError?: boolean }>`
  width: 100px;
  padding: 6px 10px;
  border: 1px solid ${({ $hasError, theme }) => ($hasError ? '#9E2A2A' : theme.colors.border.subtle)};
  border-radius: 6px;
  font-size: 14px;
  background: ${({ theme }) => theme.colors.surface.canvas};
  color: ${({ theme }) => theme.colors.text.primary};
  text-align: right;

  &:focus {
    outline: none;
    border-color: ${({ $hasError }) => ($hasError ? '#9E2A2A' : '#0F6E56')};
    box-shadow: 0 0 0 2px ${({ $hasError }) => ($hasError ? 'rgba(239,68,68,0.1)' : 'rgba(59,130,246,0.1)')};
  }

  &:disabled {
    background: ${({ theme }) => theme.colors.surface.raised};
    cursor: not-allowed;
    opacity: 0.6;
  }
`;

const TakeError = styled.span`
  font-size: 12px;
  color: #9E2A2A;
`;

const Separator = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 4px 0;

  &::before,
  &::after {
    content: '';
    flex: 1;
    height: 1px;
    background: ${({ theme }) => theme.colors.surface.sunken};
  }
`;

const SeparatorText = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.text.secondary};
  white-space: nowrap;
  font-weight: 500;
`;

// ---- Warning / info banners ----
const warningStyle = css`
  font-size: 13px;
  padding: 10px 14px;
  border-radius: 8px;
  display: flex;
  align-items: flex-start;
  gap: 8px;
`;

const WarningBanner = styled.div`
  ${warningStyle}
  background: #FEF9C3;
  border: 1px solid #FDE047;
  color: #713F12;
`;

const ErrorBanner = styled.div`
  ${warningStyle}
  background: #FEF2F2;
  border: 1px solid #FECACA;
  color: #9E2A2A;
`;

// ---- Summary ----
const SummaryBox = styled.div`
  background: ${({ theme }) => theme.colors.surface.canvas};
  border: 1px solid ${({ theme }) => theme.colors.surface.sunken};
  border-radius: 8px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const SummaryTotal = styled.div`
  font-size: 15px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.primary};
`;

const SummaryLine = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.secondary};
  padding-left: 12px;
`;

const SummaryContainerLine = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.text.secondary};
  font-style: italic;
`;

// ---- Price / total ----
const PriceRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
`;

const PriceInputWrap = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: 8px;
  padding: 0 12px;
  background: ${({ theme }) => theme.colors.surface.canvas};

  &:focus-within {
    border-color: #0F6E56;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
`;

const PriceInput = styled.input`
  border: none;
  outline: none;
  font-size: 14px;
  width: 100px;
  padding: 10px 0;
  background: transparent;
  color: ${({ theme }) => theme.colors.text.primary};
  text-align: right;
`;

const PriceSuffix = styled.span`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.secondary};
  white-space: nowrap;
`;

const LineTotalDisplay = styled.div`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text.primary};

  strong {
    font-weight: 600;
  }
`;

// ---- Duplicate-merge prompt ----
const MergePrompt = styled.div`
  background: rgba(15,110,86,0.05);
  border: 1px solid rgba(15,110,86,0.12);
  border-radius: 8px;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const MergeText = styled.p`
  font-size: 13px;
  color: #1E40AF;
  margin: 0;
`;

const MergeActions = styled.div`
  display: flex;
  gap: 8px;
`;

// ---- Footer buttons ----
const FooterButton = styled.button<{ $variant?: 'primary' | 'secondary' }>`
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  border: none;

  ${({ $variant, theme }) => {
    if ($variant === 'secondary') {
      return `
        background: transparent;
        color: ${theme.colors.text.secondary};
        border: 1px solid ${theme.colors.border.subtle};
        &:hover {
          background: ${theme.colors.surface.raised};
        }
      `;
    }
    return `
      background: #0F6E56;
      color: white;
      &:hover:not(:disabled) {
        background: #0B5644;
      }
      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    `;
  }}
`;

// ---- Spinner ----
const Spinner = styled.span`
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid ${({ theme }) => theme.colors.border.subtle};
  border-top-color: #0F6E56;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;

const EmptyState = styled.div`
  padding: 20px;
  text-align: center;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.secondary};
`;

// ============================================================================
// COMPONENT
// ============================================================================

export function AddOrderItemModal({
  isOpen,
  onClose,
  onAdd,
  existingItems,
}: AddOrderItemModalProps) {
  const listboxId = useId();

  // ---- Crop typeahead state ----
  const [cropQuery, setCropQuery] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  /**
   * Each entry: plantName + aggregated availability across harvest+returned.
   */
  interface CropOption {
    plantName: string;
    totalKg: number;
    farmCount: number;
    hasReturned: boolean;
  }
  const [cropOptions, setCropOptions] = useState<CropOption[]>([]);

  // ---- Selection state ----
  const [selectedPlantName, setSelectedPlantName] = useState<string | null>(null);
  const [selectedGrade, setSelectedGrade] = useState<Grade | null>(null);

  // Raw rows fetched for the selected crop (all grades) after selection.
  const [harvestRows, setHarvestRows] = useState<HarvestInventory[]>([]);
  const [returnedRows, setReturnedRows] = useState<ReturnedInventory[]>([]);
  const [isLoadingRows, setIsLoadingRows] = useState(false);
  const [rowsError, setRowsError] = useState<string | null>(null);

  // Farm name lookup map: farmId → farmName
  const [farmNameMap, setFarmNameMap] = useState<Record<string, string>>({});
  const farmNamesLoadedRef = useRef(false);

  // ---- Grade availability ----
  // Computed from harvestRows + returnedRows for the selected crop.
  const gradeAvailability = useMemo<Record<Grade, number>>(() => {
    const result: Record<Grade, number> = { A: 0, B: 0, C: 0 };
    for (const row of harvestRows) {
      const g = backendGradeToLabel(row.qualityGrade);
      if (g) result[g] += row.availableQuantity;
    }
    for (const row of returnedRows) {
      const g = backendGradeToLabel(row.qualityGrade);
      if (g) result[g] += row.availableQuantity;
    }
    return result;
  }, [harvestRows, returnedRows]);

  // ---- Mode ----
  const [inputMode, setInputMode] = useState<'kg' | 'containers'>('kg');

  // ---- Container math ----
  const [containerCount, setContainerCount] = useState<string>('');
  const [containerSize, setContainerSize] = useState<string>('');

  const computedContainerKg = useMemo(() => {
    const count = parseFloat(containerCount);
    const size = parseFloat(containerSize);
    if (!isNaN(count) && !isNaN(size) && count > 0 && size > 0) {
      return count * size;
    }
    return 0;
  }, [containerCount, containerSize]);

  // ---- Auto-fill (kg mode) ----
  const [needKg, setNeedKg] = useState<string>('');
  const [autoFillWarning, setAutoFillWarning] = useState<string | null>(null);

  // ---- Per-farm take amounts ----
  const [farmTakes, setFarmTakes] = useState<FarmTakeRow[]>([]);
  const [farmTakeErrors, setFarmTakeErrors] = useState<Record<string, string>>({});

  // ---- Per-returned take amounts ----
  const [returnedTakes, setReturnedTakes] = useState<ReturnedTakeRow[]>([]);
  const [returnedTakeErrors, setReturnedTakeErrors] = useState<Record<string, string>>({});

  // ---- Price ----
  const [unitPrice, setUnitPrice] = useState<string>('');

  // ---- Duplicate-merge ----
  const [mergePromptOpen, setMergePromptOpen] = useState(false);
  const [pendingItem, setPendingItem] = useState<OrderItem | null>(null);
  const [duplicateIndex, setDuplicateIndex] = useState<number | null>(null);

  // ---- Refs ----
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLUListElement>(null);

  // Computed positioning for the portaled crop dropdown — keeps it visible
  // outside the modal's clipped bounds, flips up when space below is tight.
  const [dropdownRect, setDropdownRect] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
    flipUp: boolean;
  }>({ top: 0, left: 0, width: 0, maxHeight: 260, flipUp: false });

  const recomputeDropdownPosition = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const PREFERRED_HEIGHT = 260;
    const MARGIN = 8;
    const spaceBelow = window.innerHeight - rect.bottom - MARGIN;
    const spaceAbove = rect.top - MARGIN;
    const flipUp = spaceBelow < 180 && spaceAbove > spaceBelow;
    const maxHeight = Math.min(
      PREFERRED_HEIGHT,
      Math.max(120, flipUp ? spaceAbove : spaceBelow),
    );
    const top = flipUp ? rect.top - maxHeight - 4 : rect.bottom + 4;
    setDropdownRect({
      top,
      left: rect.left,
      width: rect.width,
      maxHeight,
      flipUp,
    });
  }, []);

  // ============================================================================
  // Derived computed values
  // ============================================================================

  /**
   * Farm batches: filtered by selectedGrade, grouped by farmId, sorted by
   * oldestHarvestDate ASC.
   */
  const farmBatches = useMemo<FarmBatch[]>(() => {
    if (!selectedGrade) return [];
    const backendGrade = GRADE_TO_BACKEND[selectedGrade];
    const gradeRows = harvestRows.filter((r) => r.qualityGrade === backendGrade && r.availableQuantity > 0);

    // Group by farmId.
    const byFarm: Record<string, HarvestInventory[]> = {};
    for (const row of gradeRows) {
      if (!byFarm[row.farmId]) byFarm[row.farmId] = [];
      byFarm[row.farmId].push(row);
    }

    // Build FarmBatch objects.
    const batches: FarmBatch[] = Object.entries(byFarm).map(([farmId, rows]) => {
      // Sort rows by harvestDate ASC for FIFO.
      const sorted = [...rows].sort(
        (a, b) => new Date(a.harvestDate).getTime() - new Date(b.harvestDate).getTime(),
      );
      const totalAvailableKg = sorted.reduce((s, r) => s + r.availableQuantity, 0);
      const oldestHarvestDate = sorted[0].harvestDate;
      const expiryDates = sorted.map((r) => r.expiryDate).filter(Boolean) as string[];
      const earliestExpiryDate = expiryDates.length > 0
        ? expiryDates.sort()[0]
        : null;

      return {
        farmId,
        farmName: farmNameMap[farmId] || farmId,
        totalAvailableKg,
        oldestHarvestDate,
        earliestExpiryDate,
        rows: sorted,
      };
    });

    // Sort batches by oldestHarvestDate ASC.
    return batches.sort(
      (a, b) => new Date(a.oldestHarvestDate).getTime() - new Date(b.oldestHarvestDate).getTime(),
    );
  }, [harvestRows, selectedGrade, farmNameMap]);

  /**
   * Farms whose oldestHarvestDate equals the absolute oldest — these get
   * the "Recommended" badge.
   */
  const recommendedFarmIds = useMemo<Set<string>>(() => {
    if (farmBatches.length === 0) return new Set();
    const oldestTs = new Date(farmBatches[0].oldestHarvestDate).getTime();
    return new Set(
      farmBatches
        .filter((b) => new Date(b.oldestHarvestDate).getTime() === oldestTs)
        .map((b) => b.farmId),
    );
  }, [farmBatches]);

  /**
   * Returned rows filtered by selectedGrade.
   */
  const gradeReturnedRows = useMemo<ReturnedInventory[]>(() => {
    if (!selectedGrade) return [];
    const backendGrade = GRADE_TO_BACKEND[selectedGrade];
    return returnedRows.filter((r) => r.qualityGrade === backendGrade && r.availableQuantity > 0);
  }, [returnedRows, selectedGrade]);

  /**
   * Total kg selected across farm takes + returned takes.
   */
  const totalSelectedKg = useMemo(() => {
    const farmTotal = farmTakes.reduce((s, r) => s + (parseFloat(String(r.takeKg)) || 0), 0);
    const retTotal = returnedTakes.reduce((s, r) => s + (parseFloat(String(r.takeKg)) || 0), 0);
    return farmTotal + retTotal;
  }, [farmTakes, returnedTakes]);

  const parsedUnitPrice = parseFloat(unitPrice) || 0;
  const lineTotal = totalSelectedKg * parsedUnitPrice;

  /**
   * In container mode: mismatch between allocation total and container math.
   */
  const containerMismatch = useMemo<string | null>(() => {
    if (inputMode !== 'containers') return null;
    if (computedContainerKg === 0) return null;
    const diff = Math.abs(totalSelectedKg - computedContainerKg);
    if (diff > 0.001) {
      return `Allocation total (${totalSelectedKg.toFixed(2)} kg) doesn't match container math (${computedContainerKg.toFixed(2)} kg). Adjust container count or per-source quantities.`;
    }
    return null;
  }, [inputMode, totalSelectedKg, computedContainerKg]);

  /**
   * Whether the Add button should be enabled.
   */
  const canAdd = useMemo(() => {
    if (!selectedPlantName || !selectedGrade) return false;
    if (totalSelectedKg <= 0) return false;
    if (parsedUnitPrice <= 0) return false;
    if (inputMode === 'containers' && containerMismatch !== null) return false;
    if (inputMode === 'containers' && computedContainerKg === 0) return false;
    return true;
  }, [
    selectedPlantName,
    selectedGrade,
    totalSelectedKg,
    parsedUnitPrice,
    inputMode,
    containerMismatch,
    computedContainerKg,
  ]);

  // ============================================================================
  // Effects
  // ============================================================================

  // Sync farm-take rows when farmBatches change (grade or crop switch).
  useEffect(() => {
    setFarmTakes(farmBatches.map((b) => ({ farmId: b.farmId, takeKg: 0 })));
    setFarmTakeErrors({});
    setAutoFillWarning(null);
  }, [farmBatches]);

  // Sync returned-take rows when gradeReturnedRows change.
  useEffect(() => {
    setReturnedTakes(gradeReturnedRows.map((r) => ({ inventoryId: r.inventoryId, takeKg: 0 })));
    setReturnedTakeErrors({});
  }, [gradeReturnedRows]);

  // Load farm names once.
  useEffect(() => {
    if (farmNamesLoadedRef.current) return;
    farmNamesLoadedRef.current = true;

    (async () => {
      try {
        // Fetch ALL farms by paginating through pages — backend caps perPage
        // at 100, so we walk until we've covered every page. Future-proof for
        // orgs with > 100 farms.
        const PAGE_SIZE = 100;
        const map: Record<string, string> = {};
        let page = 1;
        let totalPages = 1;
        do {
          const res = await getFarms(page, PAGE_SIZE);
          for (const farm of res.items) {
            if (farm.farmId && farm.name) {
              map[farm.farmId] = farm.name;
            }
          }
          totalPages = res.totalPages || 1;
          page += 1;
        } while (page <= totalPages);
        setFarmNameMap(map);
      } catch {
        // Non-critical — farmId will be shown as fallback.
      }
    })();
  }, []);

  // Reset all internal state when modal is closed (so it opens fresh).
  useEffect(() => {
    if (!isOpen) {
      resetState();
    }
  }, [isOpen]);

  // Close dropdown on click-outside. Also exclude the portaled dropdown
  // since it lives outside wrapperRef.
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      const inWrapper = wrapperRef.current?.contains(target);
      const inDropdown = dropdownRef.current?.contains(target);
      if (!inWrapper && !inDropdown) {
        setDropdownOpen(false);
        setHighlightedIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, []);

  // Recompute dropdown position when it opens, on viewport scroll/resize.
  // Without this, scrolling the modal body would leave the portaled dropdown
  // floating in place.
  useEffect(() => {
    if (!dropdownOpen) return;
    recomputeDropdownPosition();
    const handleReposition = () => recomputeDropdownPosition();
    window.addEventListener('scroll', handleReposition, true);
    window.addEventListener('resize', handleReposition);
    return () => {
      window.removeEventListener('scroll', handleReposition, true);
      window.removeEventListener('resize', handleReposition);
    };
  }, [dropdownOpen, recomputeDropdownPosition]);

  // ============================================================================
  // Crop typeahead search
  // ============================================================================

  const scheduleCropSearch = useCallback((query: string) => {
    if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    abortRef.current?.abort();

    if (query.trim().length < 1) {
      setCropOptions([]);
      setIsSearching(false);
      setSearchError(null);
      return;
    }

    debounceRef.current = setTimeout(() => runCropSearch(query), DEBOUNCE_MS);
  }, []);

  async function runCropSearch(query: string) {
    abortRef.current = new AbortController();
    setIsSearching(true);
    setSearchError(null);

    try {
      const [harvestRes, returnedRes] = await Promise.all([
        listHarvestInventory({ search: query, perPage: 50 }),
        listReturnedInventory({ search: query, perPage: 50 }),
      ]);

      if (abortRef.current.signal.aborted) return;

      // Aggregate by plantName.
      const byName: Record<
        string,
        { totalKg: number; farmIds: Set<string>; hasReturned: boolean }
      > = {};

      for (const row of harvestRes.items) {
        if (!byName[row.plantName]) {
          byName[row.plantName] = { totalKg: 0, farmIds: new Set(), hasReturned: false };
        }
        byName[row.plantName].totalKg += row.availableQuantity;
        if (row.farmId) byName[row.plantName].farmIds.add(row.farmId);
      }

      for (const row of returnedRes.items) {
        if (!byName[row.plantName]) {
          byName[row.plantName] = { totalKg: 0, farmIds: new Set(), hasReturned: false };
        }
        byName[row.plantName].totalKg += row.availableQuantity;
        byName[row.plantName].hasReturned = true;
      }

      const options: CropOption[] = Object.entries(byName)
        .map(([plantName, info]) => ({
          plantName,
          totalKg: info.totalKg,
          farmCount: info.farmIds.size,
          hasReturned: info.hasReturned,
        }))
        .sort((a, b) => a.plantName.localeCompare(b.plantName));

      setCropOptions(options);
      setHighlightedIndex(-1);
    } catch {
      if (abortRef.current?.signal.aborted) return;
      setSearchError('Search failed. Try typing again.');
    } finally {
      if (!abortRef.current?.signal.aborted) {
        setIsSearching(false);
      }
    }
  }

  // ============================================================================
  // Fetch all rows for a chosen crop
  // ============================================================================

  async function fetchRowsForCrop(plantName: string) {
    setIsLoadingRows(true);
    setRowsError(null);
    setHarvestRows([]);
    setReturnedRows([]);

    try {
      const [harvestRes, returnedRes] = await Promise.all([
        listHarvestInventory({ search: plantName, perPage: 100 }),
        listReturnedInventory({ search: plantName, perPage: 100 }),
      ]);

      // Client-side filter: exact plant name match, available > 0.
      const harvest = harvestRes.items.filter(
        (r) => r.plantName === plantName && r.availableQuantity > 0,
      );
      const returned = returnedRes.items.filter(
        (r) => r.plantName === plantName && r.availableQuantity > 0,
      );

      setHarvestRows(harvest);
      setReturnedRows(returned);

      // Auto-select the first grade with stock.
      for (const grade of GRADES) {
        const backendGrade = GRADE_TO_BACKEND[grade];
        const hasStock =
          harvest.some((r) => r.qualityGrade === backendGrade && r.availableQuantity > 0) ||
          returned.some((r) => r.qualityGrade === backendGrade && r.availableQuantity > 0);
        if (hasStock) {
          setSelectedGrade(grade);
          break;
        }
      }
    } catch {
      setRowsError('Failed to load inventory. Please try again.');
    } finally {
      setIsLoadingRows(false);
    }
  }

  // ============================================================================
  // Selection / reset helpers
  // ============================================================================

  function selectCrop(plantName: string) {
    setSelectedPlantName(plantName);
    setCropQuery(plantName);
    setDropdownOpen(false);
    setHighlightedIndex(-1);
    setCropOptions([]);
    setSelectedGrade(null);
    setNeedKg('');
    setAutoFillWarning(null);
    setInputMode('kg');

    // Restore container size from localStorage memory.
    const savedSize = localStorage.getItem(containerSizeKey(plantName));
    setContainerSize(savedSize || '');
    setContainerCount('');

    fetchRowsForCrop(plantName);
  }

  function clearCrop() {
    setSelectedPlantName(null);
    setCropQuery('');
    setDropdownOpen(false);
    setCropOptions([]);
    setSelectedGrade(null);
    setHarvestRows([]);
    setReturnedRows([]);
    setFarmTakes([]);
    setReturnedTakes([]);
    setNeedKg('');
    setAutoFillWarning(null);
    setInputMode('kg');
    setContainerCount('');
    setContainerSize('');
    setUnitPrice('');
    setMergePromptOpen(false);
    setPendingItem(null);
    setDuplicateIndex(null);
  }

  function resetState() {
    clearCrop();
  }

  // ============================================================================
  // Grade chips
  // ============================================================================

  function handleGradeSelect(grade: Grade) {
    if (gradeAvailability[grade] === 0) return;
    setSelectedGrade(grade);
    setNeedKg('');
    setAutoFillWarning(null);
  }

  // ============================================================================
  // Container size with localStorage persistence
  // ============================================================================

  function handleContainerSizeChange(value: string) {
    setContainerSize(value);
    if (selectedPlantName && value) {
      localStorage.setItem(containerSizeKey(selectedPlantName), value);
    }
  }

  // ============================================================================
  // Auto-fill (FIFO, farm batches only)
  // ============================================================================

  function handleAutoFill() {
    // The "need" comes from either the kg-mode Need input or the
    // container-mode computed total (count × size). Same FIFO walk either way.
    const need =
      inputMode === 'containers' ? computedContainerKg : parseFloat(needKg);
    if (isNaN(need) || need <= 0) return;

    let remaining = need;
    const newTakes: FarmTakeRow[] = farmBatches.map((batch) => {
      if (remaining <= 0) return { farmId: batch.farmId, takeKg: 0 };
      const take = Math.min(remaining, batch.totalAvailableKg);
      remaining -= take;
      return { farmId: batch.farmId, takeKg: take };
    });
    setFarmTakes(newTakes);

    if (remaining > 0.001) {
      const filledKg = (need - remaining).toFixed(2);
      setAutoFillWarning(
        `Only ${filledKg} kg available across farms — adjust manually or add returned stock below.`,
      );
    } else {
      setAutoFillWarning(null);
    }
  }

  // ============================================================================
  // Farm take inputs
  // ============================================================================

  function handleFarmTakeChange(farmId: string, value: string) {
    const numVal = parseFloat(value);
    setFarmTakes((prev) =>
      prev.map((r) => (r.farmId === farmId ? { ...r, takeKg: isNaN(numVal) ? 0 : numVal } : r)),
    );

    // Validate.
    const batch = farmBatches.find((b) => b.farmId === farmId);
    if (batch && !isNaN(numVal) && numVal > batch.totalAvailableKg) {
      setFarmTakeErrors((prev) => ({
        ...prev,
        [farmId]: `Max available: ${batch.totalAvailableKg.toFixed(2)} kg`,
      }));
    } else {
      setFarmTakeErrors((prev) => {
        const next = { ...prev };
        delete next[farmId];
        return next;
      });
    }
  }

  // ============================================================================
  // Returned take inputs
  // ============================================================================

  function handleReturnedTakeChange(inventoryId: string, value: string) {
    const numVal = parseFloat(value);
    setReturnedTakes((prev) =>
      prev.map((r) =>
        r.inventoryId === inventoryId ? { ...r, takeKg: isNaN(numVal) ? 0 : numVal } : r,
      ),
    );

    const row = gradeReturnedRows.find((r) => r.inventoryId === inventoryId);
    if (row && !isNaN(numVal) && numVal > row.availableQuantity) {
      setReturnedTakeErrors((prev) => ({
        ...prev,
        [inventoryId]: `Max available: ${row.availableQuantity.toFixed(2)} kg`,
      }));
    } else {
      setReturnedTakeErrors((prev) => {
        const next = { ...prev };
        delete next[inventoryId];
        return next;
      });
    }
  }

  // ============================================================================
  // Build the OrderItem and handle duplicate detection
  // ============================================================================

  function handleAdd() {
    if (!selectedPlantName || !selectedGrade) return;

    // Build allocations.
    const allocations: OrderItemAllocation[] = [];

    // Farm allocations — split FIFO across underlying rows.
    for (const takeRow of farmTakes) {
      if (!takeRow.takeKg || takeRow.takeKg <= 0) continue;
      const batch = farmBatches.find((b) => b.farmId === takeRow.farmId);
      if (!batch) continue;
      allocations.push(
        ...splitAcrossHarvestRows(batch, takeRow.takeKg, batch.farmName),
      );
    }

    // Returned allocations.
    for (const takeRow of returnedTakes) {
      if (!takeRow.takeKg || takeRow.takeKg <= 0) continue;
      const row = gradeReturnedRows.find((r) => r.inventoryId === takeRow.inventoryId);
      if (!row) continue;
      allocations.push({
        inventorySource: 'returned',
        inventoryId: takeRow.inventoryId,
        farmId: null,
        farmName: null,
        quantity: takeRow.takeKg,
      });
    }

    const price = parseFloat(unitPrice) || 0;

    // Derive productId from the underlying inventory rows. Backend's OrderItem
    // requires a productId (UUID of the plant_data record). All rows for the
    // same plantName share the same plantDataId, so we grab it from whichever
    // row we have at hand — harvest first, returned as fallback.
    const productId =
      harvestRows[0]?.plantDataId ?? gradeReturnedRows[0]?.plantDataId;

    const newItem: OrderItem = {
      productId,
      productName: selectedPlantName,
      qualityGrade: selectedGrade,
      quantity: totalSelectedKg,
      unitPrice: price,
      totalPrice: totalSelectedKg * price,
      allocations,
      containerCount:
        inputMode === 'containers' ? (parseFloat(containerCount) || null) : undefined,
      containerSize:
        inputMode === 'containers' ? (parseFloat(containerSize) || null) : undefined,
    };

    // Duplicate detection.
    const existingIdx = existingItems.findIndex(
      (item) =>
        item.productName === selectedPlantName && item.qualityGrade === selectedGrade,
    );

    if (existingIdx !== -1) {
      // Prompt to merge.
      setPendingItem(newItem);
      setDuplicateIndex(existingIdx);
      setMergePromptOpen(true);
      return;
    }

    commitAdd(newItem);
  }

  function commitAdd(item: OrderItem) {
    onAdd(item);
    resetState();
    onClose();
  }

  function handleMerge() {
    if (!pendingItem || duplicateIndex === null) return;

    const existing = existingItems[duplicateIndex];
    const mergedItem: OrderItem = {
      ...existing,
      quantity: existing.quantity + pendingItem.quantity,
      totalPrice:
        (existing.quantity + pendingItem.quantity) * existing.unitPrice,
      allocations: [
        ...(existing.allocations || []),
        ...(pendingItem.allocations || []),
      ],
      // Container fields: keep the existing values (don't override on merge).
    };

    onAdd(mergedItem);
    resetState();
    onClose();
  }

  // ============================================================================
  // Keyboard nav for crop combobox
  // ============================================================================

  function handleCropKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!dropdownOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        setDropdownOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < cropOptions.length - 1 ? prev + 1 : prev,
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < cropOptions.length) {
          const opt = cropOptions[highlightedIndex];
          if (opt.totalKg > 0) selectCrop(opt.plantName);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setDropdownOpen(false);
        setHighlightedIndex(-1);
        break;
      default:
        break;
    }
  }

  // ============================================================================
  // Render helpers
  // ============================================================================

  function renderCropDropdown() {
    if (isSearching) {
      return (
        <DropdownStatus role="status" aria-live="polite">
          <Spinner aria-hidden="true" />
          &nbsp;Searching…
        </DropdownStatus>
      );
    }
    if (searchError) {
      return (
        <DropdownStatus role="alert" aria-live="assertive">
          {searchError}
        </DropdownStatus>
      );
    }
    if (cropOptions.length === 0) {
      return (
        <DropdownStatus>
          {cropQuery.trim().length < 1
            ? 'Type to search crops…'
            : 'No matching crops with stock found.'}
        </DropdownStatus>
      );
    }

    return cropOptions.map((opt, idx) => {
      const isDisabled = opt.totalKg === 0;
      const metaParts: string[] = [];
      if (opt.totalKg > 0) metaParts.push(`Total available: ${opt.totalKg.toFixed(1)} kg`);
      if (opt.farmCount > 0)
        metaParts.push(`across ${opt.farmCount} farm${opt.farmCount !== 1 ? 's' : ''}`);
      if (opt.hasReturned) metaParts.push('+ returned stock');
      if (isDisabled) metaParts.push('no stock');

      return (
        <DropdownItem
          key={opt.plantName}
          role="option"
          id={`${listboxId}-opt-${idx}`}
          aria-selected={idx === highlightedIndex}
          aria-disabled={isDisabled ? 'true' : undefined}
          $highlighted={idx === highlightedIndex}
          $disabled={isDisabled}
          onMouseDown={(e) => {
            e.preventDefault();
            if (!isDisabled) selectCrop(opt.plantName);
          }}
          onMouseEnter={() => {
            if (!isDisabled) setHighlightedIndex(idx);
          }}
        >
          <CropName>{opt.plantName}</CropName>
          {metaParts.length > 0 && <CropMeta>{metaParts.join(' ')}</CropMeta>}
        </DropdownItem>
      );
    });
  }

  function renderGradeChips() {
    return (
      <GradeRow role="group" aria-label="Quality grade selection">
        {GRADES.map((grade) => {
          const hasStock = gradeAvailability[grade] > 0;
          const isSelected = selectedGrade === grade;
          return (
            <GradeChip
              key={grade}
              type="button"
              $selected={isSelected}
              $disabled={!hasStock}
              disabled={!hasStock}
              onClick={() => handleGradeSelect(grade)}
              aria-pressed={isSelected}
              aria-label={`Grade ${grade}${hasStock ? ` — ${gradeAvailability[grade].toFixed(1)} kg available` : ' — no stock'}`}
            >
              Grade {grade}
            </GradeChip>
          );
        })}
      </GradeRow>
    );
  }

  function renderContainerMathRow() {
    return (
      <ContainerMathRow>
        <MathLabel>Containers:</MathLabel>
        <SmallNumInput
          type="number"
          min="1"
          step="1"
          value={containerCount}
          onChange={(e) => setContainerCount(e.target.value)}
          aria-label="Number of containers"
          placeholder="0"
        />
        <MathLabel>×</MathLabel>
        <SmallNumInput
          type="number"
          min="0.01"
          step="0.1"
          value={containerSize}
          onChange={(e) => handleContainerSizeChange(e.target.value)}
          aria-label="Container size in kg"
          placeholder="kg each"
        />
        <MathLabel>kg per container =</MathLabel>
        <MathResult aria-live="polite">
          {computedContainerKg > 0 ? `${computedContainerKg.toFixed(2)} kg` : '—'}
        </MathResult>
      </ContainerMathRow>
    );
  }

  function renderAutoFillRow() {
    // Container mode: compact button that auto-fills from the computed
    // container math total. No "Need" input — count × size IS the need.
    if (inputMode === 'containers') {
      const need = computedContainerKg;
      return (
        <AutoFillRow>
          <MathLabel>Need: {need > 0 ? `${need.toFixed(2)} kg` : '—'}</MathLabel>
          <AutoFillButton
            type="button"
            onClick={handleAutoFill}
            disabled={need <= 0 || farmBatches.length === 0}
            title="Allocates oldest farm stock first (FIFO). Returned stock is excluded."
          >
            Auto-fill (FIFO)
          </AutoFillButton>
          <InfoTip aria-label="Allocates oldest farm stock first">
            Allocates oldest farm stock first
          </InfoTip>
        </AutoFillRow>
      );
    }
    return (
      <AutoFillRow>
        <TakeLabel htmlFor="need-kg-input">Need</TakeLabel>
        <NeedInput
          id="need-kg-input"
          type="number"
          min="0.01"
          step="0.1"
          value={needKg}
          onChange={(e) => setNeedKg(e.target.value)}
          placeholder="0"
          aria-label="Quantity needed in kg"
        />
        <MathLabel>kg</MathLabel>
        <AutoFillButton
          type="button"
          onClick={handleAutoFill}
          disabled={!needKg || parseFloat(needKg) <= 0 || farmBatches.length === 0}
          title="Allocates oldest farm stock first (FIFO). Returned stock is excluded."
        >
          Auto-fill (FIFO)
        </AutoFillButton>
        <InfoTip aria-label="Allocates oldest farm stock first">
          Allocates oldest farm stock first
        </InfoTip>
      </AutoFillRow>
    );
  }

  function renderFarmBatches() {
    if (isLoadingRows) {
      return <EmptyState><Spinner /> Loading inventory…</EmptyState>;
    }
    if (rowsError) {
      return <ErrorBanner role="alert"><span>&#9888;</span>{rowsError}</ErrorBanner>;
    }
    if (!selectedGrade) return null;
    if (farmBatches.length === 0) {
      return (
        <EmptyState>No farm stock available for this crop+grade.</EmptyState>
      );
    }

    return farmBatches.map((batch) => {
      const isRecommended = recommendedFarmIds.has(batch.farmId);
      const takeRow = farmTakes.find((r) => r.farmId === batch.farmId);
      const takeKg = takeRow ? takeRow.takeKg : 0;
      const takeErr = farmTakeErrors[batch.farmId];

      return (
        <SourceRow key={batch.farmId}>
          <SourceRowHeader>
            <FarmRowName>
              {isRecommended && (
                <RecommendedBadge aria-label="Recommended — oldest stock">
                  &#9733; Recommended
                </RecommendedBadge>
              )}
              {batch.farmName}
            </FarmRowName>
            <AvailBadge>{batch.totalAvailableKg.toFixed(2)} kg available</AvailBadge>
          </SourceRowHeader>
          <SourceMeta>
            Oldest: {fmtDate(batch.oldestHarvestDate)} &middot; Expires:{' '}
            {fmtDate(batch.earliestExpiryDate)}
          </SourceMeta>
          <TakeInputRow>
            <TakeLabel htmlFor={`farm-take-${batch.farmId}`}>Take:</TakeLabel>
            <TakeInput
              id={`farm-take-${batch.farmId}`}
              type="number"
              min="0"
              max={batch.totalAvailableKg}
              step="0.1"
              value={takeKg || ''}
              onChange={(e) => handleFarmTakeChange(batch.farmId, e.target.value)}
              $hasError={!!takeErr}
              aria-label={`Take quantity from ${batch.farmName}`}
              disabled={false}
              placeholder="0"
            />
            <MathLabel>kg</MathLabel>
            {takeErr && <TakeError role="alert">{takeErr}</TakeError>}
          </TakeInputRow>
        </SourceRow>
      );
    });
  }

  function renderReturnedRows() {
    if (!selectedGrade || gradeReturnedRows.length === 0) return null;

    return (
      <>
        <Separator>
          <SeparatorText>Returned stock</SeparatorText>
        </Separator>
        <Panel aria-label="Returned stock section">
          <PanelHeading>Returned stock</PanelHeading>
          {gradeReturnedRows.map((row) => {
            const takeRow = returnedTakes.find((r) => r.inventoryId === row.inventoryId);
            const takeKg = takeRow ? takeRow.takeKg : 0;
            const takeErr = returnedTakeErrors[row.inventoryId];
            const orderRef = row.sourceOrderId
              ? `Order ${row.sourceOrderId.slice(0, 8)}…`
              : '(unknown order)';

            return (
              <SourceRow key={row.inventoryId}>
                <SourceRowHeader>
                  <FarmRowName>Return from {orderRef}</FarmRowName>
                  <AvailBadge>{row.availableQuantity.toFixed(2)} kg available</AvailBadge>
                </SourceRowHeader>
                <SourceMeta>
                  Returned {fmtDate(row.returnDate)} &middot; Originally harvested{' '}
                  {fmtDate(row.harvestDate)}
                </SourceMeta>
                <TakeInputRow>
                  <TakeLabel htmlFor={`ret-take-${row.inventoryId}`}>Take:</TakeLabel>
                  <TakeInput
                    id={`ret-take-${row.inventoryId}`}
                    type="number"
                    min="0"
                    max={row.availableQuantity}
                    step="0.1"
                    value={takeKg || ''}
                    onChange={(e) =>
                      handleReturnedTakeChange(row.inventoryId, e.target.value)
                    }
                    $hasError={!!takeErr}
                    aria-label={`Take quantity from returned stock ${orderRef}`}
                    placeholder="0"
                  />
                  <MathLabel>kg</MathLabel>
                  {takeErr && <TakeError role="alert">{takeErr}</TakeError>}
                </TakeInputRow>
              </SourceRow>
            );
          })}
        </Panel>
      </>
    );
  }

  function renderSummary() {
    const farmLines = farmTakes
      .filter((r) => r.takeKg > 0)
      .map((r) => {
        const batch = farmBatches.find((b) => b.farmId === r.farmId);
        return { label: batch?.farmName || r.farmId, kg: r.takeKg };
      });

    const returnedLines = returnedTakes
      .filter((r) => r.takeKg > 0)
      .map((r) => {
        const row = gradeReturnedRows.find((rr) => rr.inventoryId === r.inventoryId);
        const ref = row?.sourceOrderId ? `Order ${row.sourceOrderId.slice(0, 8)}…` : r.inventoryId;
        return { label: `returned (${ref})`, kg: r.takeKg };
      });

    const allLines = [...farmLines, ...returnedLines];
    if (allLines.length === 0 && totalSelectedKg === 0) return null;

    return (
      <SummaryBox aria-live="polite" aria-label="Selection summary">
        <SummaryTotal>Selected: {totalSelectedKg.toFixed(2)} kg total</SummaryTotal>
        {allLines.map((line, i) => (
          <SummaryLine key={i}>
            &bull; {line.kg.toFixed(2)} kg from {line.label}
          </SummaryLine>
        ))}
        {inputMode === 'containers' && computedContainerKg > 0 && (
          <SummaryContainerLine>
            ({parseFloat(containerCount) || 0} containers &times;{' '}
            {parseFloat(containerSize) || 0} kg)
          </SummaryContainerLine>
        )}
      </SummaryBox>
    );
  }

  function renderMergePrompt() {
    if (!mergePromptOpen) return null;
    return (
      <MergePrompt role="alert">
        <MergeText>
          This crop+grade is already on the order. Add the new quantity to the existing line?
        </MergeText>
        <MergeActions>
          <FooterButton
            type="button"
            $variant="primary"
            onClick={handleMerge}
          >
            Merge
          </FooterButton>
          <FooterButton
            type="button"
            $variant="secondary"
            onClick={() => {
              setMergePromptOpen(false);
              setPendingItem(null);
              setDuplicateIndex(null);
            }}
          >
            Cancel
          </FooterButton>
        </MergeActions>
      </MergePrompt>
    );
  }

  // ============================================================================
  // Guard: don't render when closed
  // ============================================================================

  if (!isOpen) return null;

  return (
    <Overlay
      // Intentionally NOT using onClick to close — project rule: modals close via X or Cancel only.
      aria-modal="true"
      role="dialog"
      aria-labelledby="add-item-modal-title"
    >
      <ModalBox onClick={(e) => e.stopPropagation()}>
        {/* ----------------------------------------------------------------
            HEADER
        ---------------------------------------------------------------- */}
        <ModalHeader>
          <ModalTitle id="add-item-modal-title">Add Item</ModalTitle>
          <CloseButton
            type="button"
            onClick={() => { resetState(); onClose(); }}
            aria-label="Close Add Item modal"
          >
            &times;
          </CloseButton>
        </ModalHeader>

        {/* ----------------------------------------------------------------
            BODY
        ---------------------------------------------------------------- */}
        <ModalBody>
          {/* 1. Crop selector */}
          <FormGroup>
            <SectionLabel htmlFor="crop-combobox-input">Crop *</SectionLabel>
            <ComboWrapper ref={wrapperRef}>
              {selectedPlantName ? (
                <SelectedCropChip aria-label={`Selected crop: ${selectedPlantName}`}>
                  <span>{selectedPlantName}</span>
                  <ChipClearButton
                    type="button"
                    onClick={clearCrop}
                    aria-label={`Clear selected crop ${selectedPlantName}`}
                  >
                    &times;
                  </ChipClearButton>
                </SelectedCropChip>
              ) : (
                <>
                  <ComboInput
                    id="crop-combobox-input"
                    ref={inputRef}
                    type="text"
                    role="combobox"
                    aria-expanded={dropdownOpen}
                    aria-controls={dropdownOpen ? listboxId : undefined}
                    aria-activedescendant={
                      dropdownOpen && highlightedIndex >= 0
                        ? `${listboxId}-opt-${highlightedIndex}`
                        : undefined
                    }
                    aria-autocomplete="list"
                    aria-label="Search crop by name"
                    autoComplete="off"
                    placeholder="Type to search crops…"
                    value={cropQuery}
                    onChange={(e) => {
                      setCropQuery(e.target.value);
                      setDropdownOpen(true);
                      scheduleCropSearch(e.target.value);
                    }}
                    onFocus={() => {
                      if (cropQuery.trim().length >= 1) setDropdownOpen(true);
                    }}
                    onKeyDown={handleCropKeyDown}
                  />
                  {dropdownOpen &&
                    createPortal(
                      <Dropdown
                        ref={dropdownRef}
                        id={listboxId}
                        role="listbox"
                        aria-label="Crop search results"
                        $top={dropdownRect.top}
                        $left={dropdownRect.left}
                        $width={dropdownRect.width}
                        $maxHeight={dropdownRect.maxHeight}
                        $flipUp={dropdownRect.flipUp}
                      >
                        {renderCropDropdown()}
                      </Dropdown>,
                      document.body,
                    )}
                </>
              )}
            </ComboWrapper>
          </FormGroup>

          {/* 2. Grade chips — only once a crop is selected and rows are loaded */}
          {selectedPlantName && !isLoadingRows && (
            <FormGroup>
              <SectionLabel>Quality Grade *</SectionLabel>
              {renderGradeChips()}
            </FormGroup>
          )}

          {/* 3. Mode toggle — only once crop+grade is chosen */}
          {selectedPlantName && selectedGrade && (
            <FormGroup>
              <SectionLabel>Input Mode</SectionLabel>
              <SegmentedControl role="group" aria-label="Input mode">
                <Segment
                  type="button"
                  $active={inputMode === 'kg'}
                  onClick={() => setInputMode('kg')}
                  aria-pressed={inputMode === 'kg'}
                >
                  kg
                </Segment>
                <Segment
                  type="button"
                  $active={inputMode === 'containers'}
                  onClick={() => setInputMode('containers')}
                  aria-pressed={inputMode === 'containers'}
                >
                  Containers
                </Segment>
              </SegmentedControl>
            </FormGroup>
          )}

          {/* 4. Container math row — only in container mode */}
          {selectedPlantName && selectedGrade && inputMode === 'containers' && (
            <FormGroup>
              <SectionLabel>Container details *</SectionLabel>
              {renderContainerMathRow()}
            </FormGroup>
          )}

          {/* 5. Auto-fill row — works in BOTH kg and container modes.
              In container mode the "need" comes from count × size; in kg
              mode it comes from the explicit input field. */}
          {selectedPlantName && selectedGrade && farmBatches.length > 0 && (
            <FormGroup>
              {renderAutoFillRow()}
              {autoFillWarning && (
                <WarningBanner role="status">
                  <span aria-hidden="true">&#9888;</span>
                  {autoFillWarning}
                </WarningBanner>
              )}
            </FormGroup>
          )}

          {/* 6+7. Per-source list */}
          {selectedPlantName && selectedGrade && (
            <FormGroup>
              <SectionLabel>Farm batches</SectionLabel>
              <Panel aria-label="Farm batches">
                <PanelHeading>Farm batches</PanelHeading>
                {renderFarmBatches()}
              </Panel>
              {renderReturnedRows()}
            </FormGroup>
          )}

          {/* 8. Summary */}
          {selectedPlantName && selectedGrade && renderSummary()}

          {/* Container mismatch warning */}
          {containerMismatch && (
            <ErrorBanner role="alert">
              <span aria-hidden="true">&#9888;</span>
              {containerMismatch}
            </ErrorBanner>
          )}

          {/* 9. Unit price */}
          {selectedPlantName && selectedGrade && (
            <FormGroup>
              <SectionLabel htmlFor="unit-price-input">Unit Price * (AED/kg)</SectionLabel>
              <PriceRow>
                <PriceInputWrap>
                  <PriceInput
                    id="unit-price-input"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={unitPrice}
                    onChange={(e) => setUnitPrice(e.target.value)}
                    aria-label="Unit price per kg in AED"
                    placeholder="0.00"
                  />
                  <PriceSuffix>AED/kg</PriceSuffix>
                </PriceInputWrap>
                {totalSelectedKg > 0 && parsedUnitPrice > 0 && (
                  <LineTotalDisplay aria-live="polite">
                    Line total: <strong>{lineTotal.toFixed(2)} AED</strong>
                  </LineTotalDisplay>
                )}
              </PriceRow>
            </FormGroup>
          )}

          {/* 11. Duplicate merge prompt */}
          {renderMergePrompt()}
        </ModalBody>

        {/* ----------------------------------------------------------------
            FOOTER
        ---------------------------------------------------------------- */}
        <ModalFooter>
          <FooterButton
            type="button"
            $variant="secondary"
            onClick={() => { resetState(); onClose(); }}
          >
            Cancel
          </FooterButton>
          <FooterButton
            type="button"
            $variant="primary"
            disabled={!canAdd}
            onClick={handleAdd}
            aria-disabled={!canAdd}
          >
            Add to Order
          </FooterButton>
        </ModalFooter>
      </ModalBox>
    </Overlay>
  );
}
