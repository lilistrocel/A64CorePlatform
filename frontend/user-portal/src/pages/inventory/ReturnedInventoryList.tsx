/**
 * ReturnedInventoryList
 *
 * Displays inventory_returned rows — goods returned by customers that are
 * available (or already depleted) for re-allocation to new orders.
 *
 * Props:
 *   embedded     — when true, strips outer padding/header for use inside StockPage tab.
 *   farmingYear  — optional year filter forwarded to the API.
 *
 * Per-row action: "Mark as Waste" — opens a confirmation modal that calls
 * POST /v1/farm/inventory/returned/{id}/mark-waste, then refreshes the list.
 *
 * Modal closes only via the X button, Cancel button, or Escape key — never on
 * overlay click (per project memory: feedback_modal_ux.md).
 *
 * Night Observatory (T-901 Phase 3, spec Docs/2-Working-Progress/night-observatory-spec.md):
 * visual reskin only — glass table/controls, Space Mono metadata, shared
 * PageHeader/Button, lucide icons in place of emoji-like glyphs. Logic,
 * routes, data-fetching, props and state are unchanged. Always rendered
 * `embedded` from StockPage today (see StockPage.tsx) — PageHeader is gated
 * on `!embedded` so a future standalone route still gets one, without
 * duplicating StockPage's own header in the current usage.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import styled, { css, keyframes } from 'styled-components';
import { X, Trash2 } from 'lucide-react';
import { PageHeader, Button, glassPanel, glassControl, monoLabel, phaseBadge } from '@a64core/shared';
import type { PhaseKey } from '@a64core/shared';
import { listReturnedInventory, markReturnedAsWaste } from '../../services/inventoryApi';
import type { ReturnedInventory, QualityGrade } from '../../types/inventory';
import { QUALITY_GRADE_LABELS } from '../../types/inventory';

// ============================================================================
// TYPES
// ============================================================================

interface ReturnedInventoryListProps {
  /** When true, strips outer padding/header so StockPage can embed it cleanly */
  embedded?: boolean;
  /** Optional farming year filter */
  farmingYear?: number | null;
}

type SortField = 'returnDate' | 'plantName' | 'qualityGrade' | 'quantity' | 'sourceOrderId' | 'returnReason';
type SortOrder = 'asc' | 'desc';

type DisposalMethodOption = 'pending' | 'compost' | 'animal_feed' | 'discard';

interface MarkWasteState {
  item: ReturnedInventory;
  disposalMethod: DisposalMethodOption;
  wasteReason: string;
}

// Derived availability status for the row
type RowStatus = 'available' | 'depleted';

function deriveRowStatus(item: ReturnedInventory): RowStatus {
  return item.availableQuantity > 0 ? 'available' : 'depleted';
}

// Quality-grade -> phase colour map (spec §5.2 extrapolation) — same
// reasoning as HarvestInventoryList.tsx: grade is a QC rating, not a literal
// "in harvest phase" event, so gold/harvesting is not used here.
const QUALITY_GRADE_PHASE: Record<QualityGrade, PhaseKey> = {
  premium: 'fruiting',
  grade_a: 'resting',
  grade_b: 'colonizing',
  grade_c: 'empty',
  processing: 'cleaning',
  rejected: 'quarantined',
};

// Row availability -> phase colour. "Available" reads as the good outcome
// (ready to re-allocate) -> fruiting (emerald); "depleted" reads as done/used
// up -> decommissioned (dim, no glow), matching the muted treatment it had
// before this pass.
const ROW_STATUS_PHASE: Record<RowStatus, PhaseKey> = {
  available: 'fruiting',
  depleted: 'decommissioned',
};

// ============================================================================
// HELPERS
// ============================================================================

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function truncate(text: string | null | undefined, maxLen: number): string {
  if (!text) return '—';
  return text.length > maxLen ? text.slice(0, maxLen) + '…' : text;
}

function shortId(id: string): string {
  return id.length > 8 ? '…' + id.slice(-8) : id;
}

function getSortIndicator(field: SortField, sortBy: SortField, sortOrder: SortOrder): string {
  if (sortBy !== field) return '';
  return sortOrder === 'asc' ? ' ▲' : ' ▼';
}

// ============================================================================
// ANIMATIONS
// ============================================================================

const spin = keyframes`
  to { transform: rotate(360deg); }
`;

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

interface ContainerProps {
  $embedded?: boolean;
}

const containerPadding = css`
  padding: ${({ theme }) => theme.spacing.lg};
`;

const Container = styled.div<ContainerProps>`
  ${({ $embedded }) => !$embedded && containerPadding}
`;

const Toolbar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: ${({ theme }) => theme.spacing.lg};
  gap: ${({ theme }) => theme.spacing.md};
  flex-wrap: wrap;
`;

const SearchInput = styled.input`
  ${glassControl}
  flex: 1;
  min-width: 200px;
  max-width: 400px;
  padding: 10px 14px;
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  color: ${({ theme }) => theme.colors.textPrimary};

  &::placeholder {
    color: ${({ theme }) => theme.colors.muted};
  }

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
`;

// ---- Table ----

const TableWrapper = styled.div`
  ${glassPanel}
  overflow: hidden;
  padding: 4px;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

const Th = styled.th`
  ${monoLabel}
  text-align: left;
  padding: 14px 16px;
  color: ${({ theme }) => theme.colors.celeste};
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  white-space: nowrap;
`;

const thActive = css`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-weight: 700;
`;

const ThSortable = styled(Th)<{ $active?: boolean }>`
  cursor: pointer;
  user-select: none;
  transition: color 0.15s ease;

  &:hover {
    color: ${({ theme }) => theme.colors.textPrimary};
  }

  ${({ $active }) => $active && thActive}
`;

const Tr = styled.tr`
  transition: background 0.15s ease;

  &:hover {
    background: rgba(180, 200, 220, 0.05);
  }
`;

const Td = styled.td`
  padding: 14px 16px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  vertical-align: middle;
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const MonoText = styled.span`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: 0.82rem;
`;

// ---- Badges ----

interface GradeBadgeProps {
  $grade: QualityGrade;
}

const GradeBadge = styled.span<GradeBadgeProps>`
  ${({ $grade }) => phaseBadge(QUALITY_GRADE_PHASE[$grade])}
`;

interface StatusBadgeProps {
  $status: RowStatus;
}

const StatusBadge = styled.span<StatusBadgeProps>`
  ${({ $status }) => phaseBadge(ROW_STATUS_PHASE[$status])}
`;

interface AvailableQtyProps {
  $depleted: boolean;
}

const AvailableQty = styled.span<AvailableQtyProps>`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: 0.85rem;
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  color: ${({ $depleted, theme }) => ($depleted ? theme.colors.muted : theme.colors.textPrimary)};
`;

// ---- Source order link ----

const OrderLink = styled.a`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  color: ${({ theme }) => theme.colors.bright.lapis};
  text-decoration: none;
  cursor: pointer;

  &:hover {
    text-decoration: underline;
  }
`;

// ---- Action button ----

const MarkWasteButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: rgba(240, 138, 112, 0.14);
  color: ${({ theme }) => theme.colors.bright.coral};
  border: 1px solid rgba(240, 138, 112, 0.4);
  border-radius: 8px;
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s ease;

  &:hover:not(:disabled) {
    background: rgba(240, 138, 112, 0.22);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.bright.coral};
    outline-offset: 2px;
  }
`;

// ---- Loading / empty / error states ----

const SpinnerEl = styled.div`
  width: 36px;
  height: 36px;
  border: 3px solid ${({ theme }) => theme.colors.line};
  border-top-color: ${({ theme }) => theme.colors.bright.lapis};
  border-radius: 50%;
  animation: ${spin} 0.8s linear infinite;
`;

const CenteredBox = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.spacing['3xl']};
  gap: ${({ theme }) => theme.spacing.md};
  text-align: center;
`;

const EmptyText = styled.p`
  font-family: ${({ theme }) => theme.typography.fontFamily.display};
  font-style: italic;
  font-weight: 400;
  font-size: 1.2rem;
  color: ${({ theme }) => theme.colors.celeste};
  max-width: 360px;
  margin: 0;
`;

const ErrorText = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  color: ${({ theme }) => theme.colors.bright.coral};
  margin: 0;
`;

// ---- Pagination ----

const Pagination = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${({ theme }) => theme.spacing.md};
  border-top: 1px solid ${({ theme }) => theme.colors.line};
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const PaginationInfo = styled.span`
  ${monoLabel}
  color: ${({ theme }) => theme.colors.muted};
`;

const PaginationButtons = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
`;

interface PageButtonProps {
  $active?: boolean;
}

const pageButtonActive = css`
  border-color: ${({ theme }) => theme.colors.secondary[500]};
  color: ${({ theme }) => theme.colors.secondary[500]};
`;

const PageButton = styled.button<PageButtonProps>`
  ${glassControl}
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.md};
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.glass.hi};
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.secondary[500]};
    outline-offset: 2px;
  }

  ${({ $active }) => $active && pageButtonActive}
`;

// ============================================================================
// MODAL STYLED COMPONENTS
// ============================================================================

const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(10, 14, 36, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1200;
`;

const ModalBox = styled.div`
  ${glassPanel}
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border-radius: 20px;
  padding: ${({ theme }) => theme.spacing.xl};
  width: 100%;
  max-width: 480px;
  max-height: 90vh;
  overflow-y: auto;
`;

const ModalHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: ${({ theme }) => theme.spacing.lg};
  gap: ${({ theme }) => theme.spacing.md};
`;

const ModalTitle = styled.h2`
  font-size: ${({ theme }) => theme.typography.fontSize.lg};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
  flex: 1;
`;

const CloseButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  border-radius: 8px;
  color: ${({ theme }) => theme.colors.muted};
  flex-shrink: 0;
  transition: color 0.15s ease;

  &:hover {
    color: ${({ theme }) => theme.colors.bright.coral};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.secondary[500]};
    outline-offset: 2px;
    border-radius: 2px;
  }
`;

const ModalBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const ModalDescription = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.muted};
  margin: 0;
  line-height: 1.5;
`;

const ModalDescriptionHighlight = styled.strong`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const FormLabel = styled.label`
  ${monoLabel}
  color: ${({ theme }) => theme.colors.celeste};
`;

const FormSelect = styled.select`
  ${glassControl}
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textPrimary};

  option {
    background-color: ${({ theme }) => theme.colors.cosmosHi};
    color: ${({ theme }) => theme.colors.textPrimary};
  }

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
`;

const FormTextarea = styled.textarea`
  ${glassControl}
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textPrimary};
  min-height: 72px;
  resize: vertical;
  font-family: inherit;

  &::placeholder {
    color: ${({ theme }) => theme.colors.muted};
  }

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
`;

const ModalActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.spacing.sm};
  margin-top: ${({ theme }) => theme.spacing.sm};
`;

const ConfirmBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.lg};
  background: rgba(240, 138, 112, 0.14);
  color: ${({ theme }) => theme.colors.bright.coral};
  border: 1px solid rgba(240, 138, 112, 0.4);
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  cursor: pointer;
  transition: background 0.15s ease;

  &:hover:not(:disabled) {
    background: rgba(240, 138, 112, 0.22);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.bright.coral};
    outline-offset: 2px;
  }
`;

// ============================================================================
// MARK-AS-WASTE MODAL
// ============================================================================

interface MarkWasteModalProps {
  state: MarkWasteState;
  onChangeDisposal: (method: DisposalMethodOption) => void;
  onChangeReason: (reason: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  submitting: boolean;
  titleId: string;
}

function MarkWasteModal({
  state,
  onChangeDisposal,
  onChangeReason,
  onCancel,
  onConfirm,
  submitting,
  titleId,
}: MarkWasteModalProps) {
  const { item, disposalMethod, wasteReason } = state;

  // Focus the modal on open for accessibility
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    boxRef.current?.focus();
  }, []);

  // Close on Escape
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    },
    [onCancel]
  );

  return (
    <ModalOverlay
      // Overlay click intentionally ignored — modal closes only via X / Cancel / Esc
      onClick={(e) => e.stopPropagation()}
    >
      <ModalBox
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <ModalHeader>
          <ModalTitle id={titleId}>
            Mark &ldquo;{item.plantName}&rdquo; as waste?
          </ModalTitle>
          <CloseButton
            type="button"
            aria-label="Close modal"
            onClick={onCancel}
            disabled={submitting}
          >
            <X size={20} strokeWidth={1.8} />
          </CloseButton>
        </ModalHeader>

        <ModalBody>
          <ModalDescription>
            This will move{' '}
            <ModalDescriptionHighlight>
              {item.availableQuantity} {item.unit}
            </ModalDescriptionHighlight>{' '}
            from returned stock to waste inventory and zero this row.
          </ModalDescription>

          <FormGroup>
            <FormLabel htmlFor="disposal-method-select">Disposal method</FormLabel>
            <FormSelect
              id="disposal-method-select"
              value={disposalMethod}
              onChange={(e) => onChangeDisposal(e.target.value as DisposalMethodOption)}
              disabled={submitting}
            >
              <option value="pending">Pending</option>
              <option value="compost">Compost</option>
              <option value="animal_feed">Animal Feed</option>
              <option value="discard">Discard</option>
            </FormSelect>
          </FormGroup>

          <FormGroup>
            <FormLabel htmlFor="waste-reason-input">Reason (optional)</FormLabel>
            <FormTextarea
              id="waste-reason-input"
              placeholder="Describe why this stock is being moved to waste..."
              value={wasteReason}
              onChange={(e) => onChangeReason(e.target.value)}
              disabled={submitting}
            />
          </FormGroup>
        </ModalBody>

        <ModalActions>
          <Button type="button" variant="secondary" size="small" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <ConfirmBtn type="button" onClick={onConfirm} disabled={submitting}>
            <Trash2 size={15} strokeWidth={1.8} />
            {submitting ? 'Moving to waste…' : 'Mark as Waste'}
          </ConfirmBtn>
        </ModalActions>
      </ModalBox>
    </ModalOverlay>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const PER_PAGE = 20;
const MODAL_TITLE_ID = 'mark-waste-modal-title';

export function ReturnedInventoryList({
  embedded = false,
  farmingYear = null,
}: ReturnedInventoryListProps) {
  // ---- list state ----
  const [items, setItems] = useState<ReturnedInventory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortField>('returnDate');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // ---- mark-as-waste modal state ----
  const [markWasteState, setMarkWasteState] = useState<MarkWasteState | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // ---- data loading ----

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Map our SortField to the API's accepted sort_by values
      const apiSortBy: 'returnDate' | 'harvestDate' | 'plantName' | 'quantity' | 'createdAt' =
        sortBy === 'qualityGrade' || sortBy === 'sourceOrderId' || sortBy === 'returnReason'
          ? 'returnDate' // fall back to returnDate for non-API-sortable fields
          : (sortBy as 'returnDate' | 'harvestDate' | 'plantName' | 'quantity' | 'createdAt');

      const result = await listReturnedInventory({
        search: search || undefined,
        sortBy: apiSortBy,
        sortOrder,
        page,
        perPage: PER_PAGE,
        farmingYear,
      });
      setItems(result.items);
      setTotal(result.total);
      setTotalPages(result.totalPages);
    } catch (err) {
      console.error('ReturnedInventoryList: failed to load', err);
      setError('Failed to load returned inventory. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [search, sortBy, sortOrder, page, farmingYear]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [search, sortBy, sortOrder, farmingYear]);

  // ---- sort handler ----

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  // ---- mark-as-waste handlers ----

  const openMarkWaste = (item: ReturnedInventory) => {
    setMarkWasteState({
      item,
      disposalMethod: 'pending',
      wasteReason: '',
    });
  };

  const closeMarkWaste = () => {
    if (!submitting) {
      setMarkWasteState(null);
    }
  };

  const handleConfirmMarkWaste = async () => {
    if (!markWasteState) return;
    setSubmitting(true);
    try {
      await markReturnedAsWaste(markWasteState.item.inventoryId, {
        disposalMethod: markWasteState.disposalMethod,
        wasteReason: markWasteState.wasteReason || undefined,
      });
      setMarkWasteState(null);
      // Refresh the list to reflect the depleted row
      await loadData();
    } catch (err) {
      console.error('ReturnedInventoryList: mark-waste failed', err);
      // Surface error inline — overlay stays open so user can retry
      setError('Failed to move item to waste. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ---- copy order ID to clipboard ----

  const handleCopyOrderId = (orderId: string) => {
    navigator.clipboard.writeText(orderId).catch(() => {
      // Clipboard API may be unavailable in some contexts — silently ignore
    });
  };

  // ---- render helpers ----

  const renderSortTh = (label: string, field: SortField) => (
    <ThSortable
      scope="col"
      $active={sortBy === field}
      onClick={() => handleSort(field)}
      aria-sort={sortBy === field ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      {label}
      <span aria-hidden="true">{getSortIndicator(field, sortBy, sortOrder)}</span>
    </ThSortable>
  );

  // ---- page-level stat for the PageHeader ----
  const availableCount = items.filter((item) => deriveRowStatus(item) === 'available').length;

  // ---- states ----

  if (loading && items.length === 0) {
    return (
      <Container $embedded={embedded}>
        <CenteredBox aria-busy="true" aria-label="Loading returned inventory">
          <SpinnerEl />
        </CenteredBox>
      </Container>
    );
  }

  if (error && items.length === 0) {
    return (
      <Container $embedded={embedded}>
        <CenteredBox>
          <ErrorText role="alert">{error}</ErrorText>
          <Button variant="secondary" size="small" onClick={loadData}>
            Retry
          </Button>
        </CenteredBox>
      </Container>
    );
  }

  return (
    <Container $embedded={embedded}>
      {!embedded && (
        <PageHeader
          breadcrumb="Inventory · Live"
          title="Returned Inventory"
          emphasizeLastWord
          description="Goods returned by customers, available for re-allocation to new orders."
          stats={[
            { value: total, label: 'Total Returns' },
            { value: availableCount, label: 'Available', alive: true },
          ]}
        />
      )}

      <Toolbar>
        <SearchInput
          type="search"
          placeholder="Search by plant name..."
          value={search}
          aria-label="Search returned inventory"
          onChange={(e) => setSearch(e.target.value)}
        />
      </Toolbar>

      {/* Inline error when a mark-waste call fails but list is still showing */}
      {error && (
        <CenteredBox style={{ padding: '12px 0' }}>
          <ErrorText role="alert">{error}</ErrorText>
        </CenteredBox>
      )}

      {items.length === 0 ? (
        <CenteredBox>
          <EmptyText>
            No returned inventory yet. Returns will appear here when reported on an order.
          </EmptyText>
        </CenteredBox>
      ) : (
        <>
          <TableWrapper>
            <Table aria-label="Returned inventory table">
              <thead>
                <tr>
                  {renderSortTh('Return Date', 'returnDate')}
                  {renderSortTh('Plant / Grade', 'plantName')}
                  {renderSortTh('Qty / Original', 'quantity')}
                  <Th scope="col">Available</Th>
                  {renderSortTh('Source Order', 'sourceOrderId')}
                  {renderSortTh('Reason', 'returnReason')}
                  <Th scope="col">Status</Th>
                  <Th scope="col">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const status = deriveRowStatus(item);
                  const isDepleted = status === 'depleted';

                  return (
                    <Tr key={item.inventoryId}>
                      {/* Return Date */}
                      <Td>
                        <MonoText>{formatDate(item.returnDate)}</MonoText>
                      </Td>

                      {/* Plant / Grade */}
                      <Td>
                        <div style={{ fontWeight: 500 }}>{item.plantName}</div>
                        {item.variety && (
                          <div
                            style={{ fontSize: '0.75rem', opacity: 0.7, fontStyle: 'italic' }}
                          >
                            {item.variety}
                          </div>
                        )}
                        <GradeBadge $grade={item.qualityGrade} style={{ marginTop: 4 }}>
                          {QUALITY_GRADE_LABELS[item.qualityGrade]}
                        </GradeBadge>
                      </Td>

                      {/* Qty / Original */}
                      <Td>
                        <MonoText>
                          {item.quantity} / {item.originalQuantity} {item.unit}
                        </MonoText>
                      </Td>

                      {/* Available */}
                      <Td>
                        <AvailableQty $depleted={isDepleted}>
                          {item.availableQuantity} {item.unit}
                        </AvailableQty>
                      </Td>

                      {/* Source Order */}
                      <Td>
                        <OrderLink
                          href={`/sales/orders/${item.sourceOrderId}`}
                          title={item.sourceOrderId}
                          onClick={(e) => {
                            // If Ctrl/Cmd-click, let browser open new tab normally.
                            // Otherwise use React Router navigation — but since we have
                            // an href, standard link behaviour already handles it.
                            // We also wire copy-on-click for the truncated display.
                            if (!e.ctrlKey && !e.metaKey) {
                              e.preventDefault();
                              handleCopyOrderId(item.sourceOrderId);
                              // Navigate programmatically is not needed here; the href
                              // already gives the user a navigable link. Ctrl+click will
                              // open in a new tab. Plain click copies the full ID so the
                              // user can paste it into a search box if preferred.
                            }
                          }}
                          aria-label={`Order ID: ${item.sourceOrderId} — click to copy`}
                        >
                          {shortId(item.sourceOrderId)}
                        </OrderLink>
                      </Td>

                      {/* Reason */}
                      <Td
                        title={item.returnReason ?? undefined}
                        style={{ maxWidth: 200 }}
                      >
                        {truncate(item.returnReason, 50)}
                      </Td>

                      {/* Status */}
                      <Td>
                        <StatusBadge $status={status}>
                          {status === 'available' ? 'Available' : 'Depleted'}
                        </StatusBadge>
                      </Td>

                      {/* Actions */}
                      <Td>
                        <MarkWasteButton
                          type="button"
                          disabled={isDepleted}
                          aria-label={`Mark ${item.plantName} as waste`}
                          onClick={() => openMarkWaste(item)}
                        >
                          <Trash2 size={13} strokeWidth={1.8} />
                          Mark as Waste
                        </MarkWasteButton>
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          </TableWrapper>

          {totalPages > 1 && (
            <Pagination>
              <PaginationInfo>
                {total > 0
                  ? `Showing ${(page - 1) * PER_PAGE + 1}–${Math.min(page * PER_PAGE, total)} of ${total}`
                  : 'No records'}
              </PaginationInfo>
              <PaginationButtons>
                <PageButton
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                  aria-label="Previous page"
                >
                  Previous
                </PageButton>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const pageNum = i + Math.max(1, page - 2);
                  if (pageNum > totalPages) return null;
                  return (
                    <PageButton
                      key={pageNum}
                      $active={pageNum === page}
                      onClick={() => setPage(pageNum)}
                      aria-label={`Page ${pageNum}`}
                      aria-current={pageNum === page ? 'page' : undefined}
                    >
                      {pageNum}
                    </PageButton>
                  );
                })}
                <PageButton
                  disabled={page === totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  aria-label="Next page"
                >
                  Next
                </PageButton>
              </PaginationButtons>
            </Pagination>
          )}
        </>
      )}

      {/* Mark-as-waste confirmation modal */}
      {markWasteState && (
        <MarkWasteModal
          state={markWasteState}
          titleId={MODAL_TITLE_ID}
          submitting={submitting}
          onChangeDisposal={(method) =>
            setMarkWasteState((prev) => prev && { ...prev, disposalMethod: method })
          }
          onChangeReason={(reason) =>
            setMarkWasteState((prev) => prev && { ...prev, wasteReason: reason })
          }
          onCancel={closeMarkWaste}
          onConfirm={handleConfirmMarkWaste}
        />
      )}
    </Container>
  );
}

export default ReturnedInventoryList;
