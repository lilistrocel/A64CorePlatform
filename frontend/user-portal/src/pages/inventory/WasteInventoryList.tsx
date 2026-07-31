/**
 * Waste Inventory List Page
 *
 * Lists and manages waste inventory records.
 *
 * Night Observatory (T-901 Phase 3, spec Docs/2-Working-Progress/night-observatory-spec.md):
 * visual reskin only — glass table/controls, Space Mono metadata, shared
 * PageHeader/Button, lucide icons in place of emoji. Logic, routes,
 * data-fetching, props and state are unchanged.
 *
 * SourceBadge / DisposalBadge deliberately do NOT go through `colors.phase.*`.
 * Both encode categorical reason/method codes (several of which can be
 * simultaneously true about the same waste record), not a single lifecycle a
 * record transitions through — collapsing them onto the shared phase map
 * would destroy the perceptual separation a warehouse worker relies on to
 * scan this table quickly. They use the `colors.bright.*` categorical
 * palette instead (the app's general-purpose chart/categorical palette, not
 * tied to one reserved meaning per hue the way `phase.*` is), built with the
 * shared `colorBadge()` mixin since `phaseBadge()` only accepts a `PhaseKey`.
 * See `sourceTypeColor` / `disposalMethodColor` below for the exact mapping
 * and rationale. Neither badge uses `bright.gold` or `phase.harvesting` —
 * gold is reserved for the literal crop-harvest phase elsewhere in the app;
 * this page never spends that budget.
 */

import React, { useState, useEffect, useCallback } from 'react';
import styled, { css, keyframes, useTheme, type DefaultTheme } from 'styled-components';
import { Inbox, Pencil, Trash2 } from 'lucide-react';
import { PageHeader, Button, glassPanel, glassControl, monoLabel, colorBadge } from '@a64core/shared';
import type { WasteInventory, WasteSummary, WasteSourceType, DisposalMethod } from '../../types/sales';
import api from '../../services/api';
import { formatNumber, formatCurrency } from '../../utils';

// Simple toast replacement — console-only, nothing user-facing renders these
// lines, but they represent toast severity icons conceptually. Emoji removed
// since they read as icon decoration, not free-form log prose.
const toast = {
  success: (msg: string) => console.log('Success:', msg),
  error: (msg: string) => console.error('Error:', msg),
  warning: (msg: string) => console.warn('Warning:', msg),
  info: (msg: string) => console.info('Info:', msg),
};

// ============================================================================
// LOCAL COLOUR HELPERS — categorical badges (see file header)
// ============================================================================

// return -> info (lapis) · expired -> terra · damaged -> coral ·
// harvest -> emerald (byproduct of a good harvest, not itself bad) ·
// quality_reject -> rose (deliberately distinct from damaged's coral so two
// different "bad" reasons never collapse onto the same hue) · other -> muted.
function sourceTypeColor(type: WasteSourceType, theme: DefaultTheme): string {
  switch (type) {
    case 'return':
      return theme.colors.bright.lapis;
    case 'expired':
      return theme.colors.bright.terra;
    case 'damaged':
      return theme.colors.bright.coral;
    case 'harvest':
      return theme.colors.bright.emerald;
    case 'quality_reject':
      return theme.colors.bright.rose;
    case 'other':
    default:
      return theme.colors.muted;
  }
}

// compost -> emerald · animal_feed -> lapis · donated -> lavender ·
// sold_discount -> terra (not gold — gold is reserved, a disposal method
// never spends it) · discard -> muted/dim · pending -> coral (still
// unhandled, needs attention).
function disposalMethodColor(method: DisposalMethod, theme: DefaultTheme): string {
  switch (method) {
    case 'compost':
      return theme.colors.bright.emerald;
    case 'animal_feed':
      return theme.colors.bright.lapis;
    case 'donated':
      return theme.colors.bright.lavender;
    case 'sold_discount':
      return theme.colors.bright.terra;
    case 'discard':
      return theme.colors.muted;
    case 'pending':
    default:
      return theme.colors.bright.coral;
  }
}

// ============================================================================
// GENERIC STYLED PRIMITIVES
// ============================================================================

const Card = styled.div`
  ${glassPanel}
  padding: 16px;
`;

// Loading spinner
const spin = keyframes`
  to { transform: rotate(360deg); }
`;

const LoadingContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 40px;
`;

const Spinner = styled.div`
  width: 40px;
  height: 40px;
  border: 3px solid ${({ theme }) => theme.colors.line};
  border-top: 3px solid ${({ theme }) => theme.colors.bright.lapis};
  border-radius: 50%;
  animation: ${spin} 1s linear infinite;
`;

const Loading = () => (
  <LoadingContainer>
    <Spinner />
  </LoadingContainer>
);

// Styled Components
interface PageContainerProps {
  $embedded?: boolean;
}

const PageContainer = styled.div<PageContainerProps>`
  padding: ${({ $embedded }) => ($embedded ? '0' : '24px')};
  max-width: 1400px;
  margin: 0 auto;
`;

const SummaryGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
`;

interface SummaryCardProps {
  $color?: string;
}

const SummaryCard = styled(Card)<SummaryCardProps>`
  text-align: center;
  border-top: 2px solid ${({ $color, theme }) => $color || theme.colors.line};
`;

const SummaryValue = styled.div`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: 1.5rem;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const SummaryLabel = styled.div`
  ${monoLabel}
  color: ${({ theme }) => theme.colors.muted};
  margin-top: 6px;
`;

const FiltersRow = styled.div`
  display: flex;
  gap: 16px;
  margin-bottom: 24px;
  flex-wrap: wrap;
`;

const FilterSelect = styled.select`
  ${glassControl}
  padding: 10px 14px;
  font-size: 0.875rem;
  min-width: 180px;
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

const SearchInput = styled.input`
  ${glassControl}
  padding: 10px 14px;
  font-size: 0.875rem;
  min-width: 200px;
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

const TableContainer = styled.div`
  overflow-x: auto;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

const TableHeader = styled.th`
  ${monoLabel}
  padding: 14px 16px;
  text-align: left;
  color: ${({ theme }) => theme.colors.celeste};
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
`;

const TableRow = styled.tr`
  transition: background 0.15s ease;

  &:hover {
    background: rgba(180, 200, 220, 0.05);
  }
`;

const TableCell = styled.td`
  padding: 14px 16px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const MonoText = styled.span`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: 0.82rem;
`;

interface SourceBadgeProps {
  $type: WasteSourceType;
}

const SourceBadge = styled.span<SourceBadgeProps>`
  ${({ $type, theme }) => colorBadge(sourceTypeColor($type, theme))}
`;

interface DisposalBadgeProps {
  $method: DisposalMethod;
}

const DisposalBadge = styled.span<DisposalBadgeProps>`
  ${({ $method, theme }) => colorBadge(disposalMethodColor($method, theme))}
`;

const ActionsCell = styled.div`
  display: flex;
  gap: 8px;
`;

interface ActionButtonProps {
  $variant?: 'primary' | 'danger';
}

const dangerAction = css`
  background: rgba(240, 138, 112, 0.14);
  color: ${({ theme }) => theme.colors.bright.coral};
  border-color: rgba(240, 138, 112, 0.4);

  &:hover {
    background: rgba(240, 138, 112, 0.22);
    color: ${({ theme }) => theme.colors.bright.coral};
  }
`;

const ActionButton = styled.button<ActionButtonProps>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  background: transparent;
  color: ${({ theme }) => theme.colors.celeste};
  border: 1px solid transparent;
  border-radius: 8px;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: rgba(180, 200, 220, 0.07);
    color: ${({ theme }) => theme.colors.textPrimary};
  }

  ${({ $variant }) => $variant === 'danger' && dangerAction}
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 64px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
`;

const EmptyHeadline = styled.p`
  font-family: ${({ theme }) => theme.typography.fontFamily.display};
  font-style: italic;
  font-weight: 400;
  font-size: 1.2rem;
  color: ${({ theme }) => theme.colors.celeste};
  margin: 0;
`;

const PaginationContainer = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-top: 1px solid ${({ theme }) => theme.colors.line};
`;

const PaginationInfo = styled.span`
  ${monoLabel}
  color: ${({ theme }) => theme.colors.muted};
`;

const PaginationButtons = styled.div`
  display: flex;
  gap: 8px;
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
  padding: 8px 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.2s;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.glass.hi};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  ${({ $active }) => $active && pageButtonActive}
`;

const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(10, 14, 36, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;

const ModalContent = styled.div`
  ${glassPanel}
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border-radius: 20px;
  padding: 24px;
  width: 100%;
  max-width: 500px;
  max-height: 90vh;
  overflow-y: auto;
`;

const ModalTitle = styled.h2`
  font-size: 1.25rem;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 20px 0;
`;

const FormGroup = styled.div`
  margin-bottom: 16px;
`;

const FormLabel = styled.label`
  ${monoLabel}
  display: block;
  color: ${({ theme }) => theme.colors.celeste};
  margin-bottom: 6px;
`;

const FormSelect = styled.select`
  ${glassControl}
  width: 100%;
  padding: 10px 14px;
  font-size: 0.875rem;
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
  width: 100%;
  padding: 10px 14px;
  font-size: 0.875rem;
  min-height: 80px;
  resize: vertical;
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

const ModalActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 20px;
`;

interface WasteInventoryListProps {
  /** When true, suppresses outer page padding so the Stock page can wrap it */
  embedded?: boolean;
}

// Component
const WasteInventoryList: React.FC<WasteInventoryListProps> = ({ embedded = false }) => {
  const theme = useTheme();
  const [wasteItems, setWasteItems] = useState<WasteInventory[]>([]);
  const [summary, setSummary] = useState<WasteSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [sourceFilter, setSourceFilter] = useState<WasteSourceType | ''>('');
  const [disposalFilter, setDisposalFilter] = useState<DisposalMethod | ''>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showDisposalModal, setShowDisposalModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<WasteInventory | null>(null);
  const [disposalForm, setDisposalForm] = useState({
    disposalMethod: 'pending' as DisposalMethod,
    disposalNotes: '',
  });
  const [exporting, setExporting] = useState(false);
  const perPage = 20;

  const handleExport = async () => {
    try {
      setExporting(true);
      const params = new URLSearchParams();
      if (sourceFilter) params.append('source_type', sourceFilter);
      if (disposalFilter) params.append('disposal_method', disposalFilter);
      if (searchTerm) params.append('search', searchTerm);

      const response = await api.get(`/v1/farm/inventory/waste/export/csv?${params.toString()}`, {
        responseType: 'blob',
      });

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'waste_inventory_export.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Export completed successfully');
    } catch (error) {
      console.error('Failed to export:', error);
      toast.error('Failed to export inventory');
    } finally {
      setExporting(false);
    }
  };

  const fetchWasteItems = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.append('page', currentPage.toString());
      params.append('per_page', perPage.toString());

      if (sourceFilter) params.append('source_type', sourceFilter);
      if (disposalFilter) params.append('disposal_method', disposalFilter);
      if (searchTerm) params.append('search', searchTerm);

      const response = await api.get(`/v1/farm/inventory/waste?${params.toString()}`);
      setWasteItems(response.data.items || []);
      setTotalPages(response.data.totalPages || 1);
      setTotal(response.data.total || 0);
    } catch (error) {
      console.error('Error fetching waste inventory:', error);
      toast.error('Failed to load waste inventory');
    } finally {
      setLoading(false);
    }
  }, [currentPage, sourceFilter, disposalFilter, searchTerm]);

  const fetchSummary = useCallback(async () => {
    try {
      const response = await api.get('/v1/farm/inventory/waste/summary');
      setSummary(response.data);
    } catch (error) {
      console.error('Error fetching waste summary:', error);
    }
  }, []);

  useEffect(() => {
    fetchWasteItems();
    fetchSummary();
  }, [fetchWasteItems, fetchSummary]);

  const handleUpdateDisposal = async () => {
    if (!selectedItem) return;

    try {
      await api.patch(`/v1/farm/inventory/waste/${selectedItem.wasteId}`, {
        disposalMethod: disposalForm.disposalMethod,
        disposalNotes: disposalForm.disposalNotes,
        disposalDate: new Date().toISOString(),
      });
      toast.success('Disposal information updated');
      setShowDisposalModal(false);
      setSelectedItem(null);
      fetchWasteItems();
      fetchSummary();
    } catch (error) {
      console.error('Error updating disposal:', error);
      toast.error('Failed to update disposal information');
    }
  };

  const handleDelete = async (wasteId: string) => {
    if (!window.confirm('Are you sure you want to delete this waste record?')) {
      return;
    }

    try {
      await api.delete(`/v1/farm/inventory/waste/${wasteId}`);
      toast.success('Waste record deleted');
      fetchWasteItems();
      fetchSummary();
    } catch (error) {
      console.error('Error deleting waste record:', error);
      toast.error('Failed to delete waste record');
    }
  };

  const openDisposalModal = (item: WasteInventory) => {
    setSelectedItem(item);
    setDisposalForm({
      disposalMethod: item.disposalMethod,
      disposalNotes: item.disposalNotes || '',
    });
    setShowDisposalModal(true);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatSourceType = (type: WasteSourceType) => {
    return type.replace('_', ' ');
  };

  const formatDisposalMethod = (method: DisposalMethod) => {
    return method.replace('_', ' ');
  };

  if (loading && wasteItems.length === 0) {
    return <Loading />;
  }

  return (
    <PageContainer $embedded={embedded}>
      {!embedded && (
        <PageHeader
          breadcrumb="Inventory · Live"
          title="Waste Inventory"
          emphasizeLastWord
          description="Track waste records from source through disposal."
          stats={[
            { value: total, label: 'Records' },
            ...(summary ? [{ value: summary.pendingDisposal, label: 'Pending Disposal' }] : []),
          ]}
        />
      )}

      {summary && (
        <SummaryGrid>
          <SummaryCard $color={theme.colors.bright.lapis}>
            <SummaryValue>{formatNumber(summary.totalWasteRecords)}</SummaryValue>
            <SummaryLabel>Total Waste Records</SummaryLabel>
          </SummaryCard>
          <SummaryCard $color={theme.colors.bright.laurel}>
            <SummaryValue>{formatNumber(summary.totalQuantity, { decimals: 2 })}</SummaryValue>
            <SummaryLabel>Total Quantity</SummaryLabel>
          </SummaryCard>
          <SummaryCard $color={theme.colors.bright.coral}>
            <SummaryValue>{formatCurrency(summary.totalEstimatedValue, 'AED')}</SummaryValue>
            <SummaryLabel>Estimated Value Lost</SummaryLabel>
          </SummaryCard>
          <SummaryCard $color={theme.colors.bright.terra}>
            <SummaryValue>{formatNumber(summary.pendingDisposal)}</SummaryValue>
            <SummaryLabel>Pending Disposal</SummaryLabel>
          </SummaryCard>
        </SummaryGrid>
      )}

      <FiltersRow>
        <SearchInput
          type="text"
          placeholder="Search by product name..."
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setCurrentPage(1);
          }}
        />
        <FilterSelect
          value={sourceFilter}
          onChange={(e) => {
            setSourceFilter(e.target.value as WasteSourceType | '');
            setCurrentPage(1);
          }}
        >
          <option value="">All Sources</option>
          <option value="harvest">Harvest</option>
          <option value="return">Return</option>
          <option value="expired">Expired</option>
          <option value="damaged">Damaged</option>
          <option value="quality_reject">Quality Reject</option>
          <option value="other">Other</option>
        </FilterSelect>
        <FilterSelect
          value={disposalFilter}
          onChange={(e) => {
            setDisposalFilter(e.target.value as DisposalMethod | '');
            setCurrentPage(1);
          }}
        >
          <option value="">All Disposal Methods</option>
          <option value="pending">Pending</option>
          <option value="compost">Compost</option>
          <option value="animal_feed">Animal Feed</option>
          <option value="discard">Discard</option>
          <option value="sold_discount">Sold at Discount</option>
          <option value="donated">Donated</option>
        </FilterSelect>
        <Button variant="secondary" size="small" onClick={handleExport} disabled={exporting}>
          <Inbox size={16} strokeWidth={1.8} />
          {exporting ? 'Exporting...' : 'Export CSV'}
        </Button>
      </FiltersRow>

      <Card>
        {wasteItems.length === 0 ? (
          <EmptyState>
            <EmptyHeadline>No waste records found</EmptyHeadline>
          </EmptyState>
        ) : (
          <>
            <TableContainer>
              <Table aria-label="Waste inventory table">
                <thead>
                  <tr>
                    <TableHeader scope="col">Product</TableHeader>
                    <TableHeader scope="col">Quantity</TableHeader>
                    <TableHeader scope="col">Source</TableHeader>
                    <TableHeader scope="col">Reason</TableHeader>
                    <TableHeader scope="col">Date</TableHeader>
                    <TableHeader scope="col">Disposal</TableHeader>
                    <TableHeader scope="col">Value Lost</TableHeader>
                    <TableHeader scope="col">Actions</TableHeader>
                  </tr>
                </thead>
                <tbody>
                  {wasteItems.map((item) => (
                    <TableRow key={item.wasteId}>
                      <TableCell>
                        <strong>{item.plantName}</strong>
                        {item.variety && <div style={{ fontSize: '0.75rem', color: theme.colors.muted }}>{item.variety}</div>}
                      </TableCell>
                      <TableCell>
                        <MonoText>{formatNumber(item.quantity, { decimals: 2 })} {item.unit}</MonoText>
                      </TableCell>
                      <TableCell>
                        <SourceBadge $type={item.sourceType}>
                          {formatSourceType(item.sourceType)}
                        </SourceBadge>
                      </TableCell>
                      <TableCell style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.wasteReason}
                      </TableCell>
                      <TableCell>
                        <MonoText>{formatDate(item.wasteDate)}</MonoText>
                      </TableCell>
                      <TableCell>
                        <DisposalBadge $method={item.disposalMethod}>
                          {formatDisposalMethod(item.disposalMethod)}
                        </DisposalBadge>
                      </TableCell>
                      <TableCell>
                        <MonoText>{item.estimatedValue ? formatCurrency(item.estimatedValue, 'AED') : '-'}</MonoText>
                      </TableCell>
                      <TableCell>
                        <ActionsCell>
                          <ActionButton $variant="primary" onClick={() => openDisposalModal(item)}>
                            <Pencil size={13} strokeWidth={1.8} /> Update
                          </ActionButton>
                          <ActionButton $variant="danger" onClick={() => handleDelete(item.wasteId)}>
                            <Trash2 size={13} strokeWidth={1.8} /> Delete
                          </ActionButton>
                        </ActionsCell>
                      </TableCell>
                    </TableRow>
                  ))}
                </tbody>
              </Table>
            </TableContainer>

            <PaginationContainer>
              <PaginationInfo>
                Showing {(currentPage - 1) * perPage + 1} to {Math.min(currentPage * perPage, total)} of {total} records
              </PaginationInfo>
              <PaginationButtons>
                <PageButton
                  onClick={() => setCurrentPage(p => p - 1)}
                  disabled={currentPage === 1}
                >
                  Previous
                </PageButton>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const pageNum = i + Math.max(1, currentPage - 2);
                  if (pageNum > totalPages) return null;
                  return (
                    <PageButton
                      key={pageNum}
                      $active={pageNum === currentPage}
                      onClick={() => setCurrentPage(pageNum)}
                    >
                      {pageNum}
                    </PageButton>
                  );
                })}
                <PageButton
                  onClick={() => setCurrentPage(p => p + 1)}
                  disabled={currentPage === totalPages}
                >
                  Next
                </PageButton>
              </PaginationButtons>
            </PaginationContainer>
          </>
        )}
      </Card>

      {/* Disposal Update Modal */}
      {showDisposalModal && selectedItem && (
        <ModalOverlay>
          <ModalContent onClick={(e) => e.stopPropagation()}>
            <ModalTitle>Update Disposal Information</ModalTitle>

            <FormGroup>
              <FormLabel>Product: {selectedItem.plantName}</FormLabel>
              <FormLabel>Quantity: {formatNumber(selectedItem.quantity, { decimals: 2 })} {selectedItem.unit}</FormLabel>
            </FormGroup>

            <FormGroup>
              <FormLabel>Disposal Method</FormLabel>
              <FormSelect
                value={disposalForm.disposalMethod}
                onChange={(e) => setDisposalForm(prev => ({
                  ...prev,
                  disposalMethod: e.target.value as DisposalMethod
                }))}
              >
                <option value="pending">Pending</option>
                <option value="compost">Compost</option>
                <option value="animal_feed">Animal Feed</option>
                <option value="discard">Discard</option>
                <option value="sold_discount">Sold at Discount</option>
                <option value="donated">Donated</option>
              </FormSelect>
            </FormGroup>

            <FormGroup>
              <FormLabel>Disposal Notes</FormLabel>
              <FormTextarea
                value={disposalForm.disposalNotes}
                onChange={(e) => setDisposalForm(prev => ({
                  ...prev,
                  disposalNotes: e.target.value
                }))}
                placeholder="Add notes about disposal..."
              />
            </FormGroup>

            <ModalActions>
              <Button variant="secondary" size="small" onClick={() => setShowDisposalModal(false)}>
                Cancel
              </Button>
              <Button variant="primary" size="small" onClick={handleUpdateDisposal}>
                Update Disposal
              </Button>
            </ModalActions>
          </ModalContent>
        </ModalOverlay>
      )}
    </PageContainer>
  );
};

export default WasteInventoryList;
