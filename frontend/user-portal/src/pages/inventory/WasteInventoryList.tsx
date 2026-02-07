/**
 * Waste Inventory List Page
 *
 * Lists and manages waste inventory records.
 */

import React, { useState, useEffect, useCallback } from 'react';
import styled, { keyframes } from 'styled-components';
import type { WasteInventory, WasteSummary, WasteSourceType, DisposalMethod, PaginatedWaste } from '../../types/sales';
import api from '../../services/api';
import { formatNumber, formatCurrency } from '../../utils';

// Simple toast replacement
const toast = {
  success: (msg: string) => console.log('✅ Success:', msg),
  error: (msg: string) => console.error('❌ Error:', msg),
  warning: (msg: string) => console.warn('⚠️ Warning:', msg),
  info: (msg: string) => console.info('ℹ️ Info:', msg),
};

// Basic Card component
const Card = styled.div`
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  padding: 16px;
`;

// Basic Button component
interface ButtonProps {
  $variant?: 'primary' | 'secondary' | 'danger' | 'success';
}

const Button = styled.button<ButtonProps>`
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;

  ${({ $variant }) => {
    switch ($variant) {
      case 'primary':
        return `
          background: #4a90d9;
          color: white;
          &:hover { background: #3a7bc8; }
        `;
      case 'danger':
        return `
          background: #dc3545;
          color: white;
          &:hover { background: #c82333; }
        `;
      case 'success':
        return `
          background: #28a745;
          color: white;
          &:hover { background: #218838; }
        `;
      default:
        return `
          background: #f8f9fa;
          color: #333;
          border: 1px solid #ddd;
          &:hover { background: #e9ecef; }
        `;
    }
  }}

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
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
  border: 3px solid #f3f3f3;
  border-top: 3px solid #4a90d9;
  border-radius: 50%;
  animation: ${spin} 1s linear infinite;
`;

const Loading = () => (
  <LoadingContainer>
    <Spinner />
  </LoadingContainer>
);

// Styled Components
const PageContainer = styled.div`
  padding: 24px;
  max-width: 1400px;
  margin: 0 auto;
`;

const PageHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  flex-wrap: wrap;
  gap: 16px;
`;

const PageTitle = styled.h1`
  font-size: 1.75rem;
  font-weight: 600;
  color: #1a1a2e;
  margin: 0;
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
  padding: 20px;
  text-align: center;
  border-left: 4px solid ${({ $color }) => $color || '#6c757d'};
`;

const SummaryValue = styled.div`
  font-size: 1.75rem;
  font-weight: 700;
  color: #1a1a2e;
`;

const SummaryLabel = styled.div`
  font-size: 0.875rem;
  color: #6c757d;
  margin-top: 4px;
`;

const FiltersRow = styled.div`
  display: flex;
  gap: 16px;
  margin-bottom: 24px;
  flex-wrap: wrap;
`;

const FilterSelect = styled.select`
  padding: 10px 14px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 0.875rem;
  min-width: 180px;
  background: white;

  &:focus {
    outline: none;
    border-color: #4a90d9;
    box-shadow: 0 0 0 2px rgba(74, 144, 217, 0.15);
  }
`;

const SearchInput = styled.input`
  padding: 10px 14px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 0.875rem;
  min-width: 200px;

  &:focus {
    outline: none;
    border-color: #4a90d9;
    box-shadow: 0 0 0 2px rgba(74, 144, 217, 0.15);
  }
`;

const ExportButton = styled.button`
  padding: 10px 20px;
  background: #f8f9fa;
  color: #333;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;

  &:hover:not(:disabled) {
    background: #e9ecef;
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
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
  padding: 14px 16px;
  text-align: left;
  font-weight: 600;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #6c757d;
  background: #f8f9fa;
  border-bottom: 2px solid #e9ecef;
`;

const TableRow = styled.tr`
  /* Striped rows for readability - alternating row colors */
  &:nth-child(even) {
    background: #f9fafb;
  }

  &:nth-child(odd) {
    background: #ffffff;
  }

  &:hover {
    background: #f0f4f8;
  }
`;

const TableCell = styled.td`
  padding: 14px 16px;
  border-bottom: 1px solid #e9ecef;
  font-size: 0.875rem;
  color: #333;
`;

interface SourceBadgeProps {
  $type: WasteSourceType;
}

const SourceBadge = styled.span<SourceBadgeProps>`
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: capitalize;

  ${({ $type }) => {
    switch ($type) {
      case 'return':
        return 'background: #EDE9FE; color: #7C3AED;';
      case 'expired':
        return 'background: #FEF3C7; color: #D97706;';
      case 'damaged':
        return 'background: #FEE2E2; color: #DC2626;';
      case 'harvest':
        return 'background: #D1FAE5; color: #059669;';
      case 'quality_reject':
        return 'background: #FCE7F3; color: #DB2777;';
      default:
        return 'background: #E5E7EB; color: #4B5563;';
    }
  }}
`;

interface DisposalBadgeProps {
  $method: DisposalMethod;
}

const DisposalBadge = styled.span<DisposalBadgeProps>`
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: capitalize;

  ${({ $method }) => {
    switch ($method) {
      case 'compost':
        return 'background: #D1FAE5; color: #059669;';
      case 'animal_feed':
        return 'background: #DBEAFE; color: #2563EB;';
      case 'donated':
        return 'background: #E0E7FF; color: #4F46E5;';
      case 'sold_discount':
        return 'background: #FEF3C7; color: #D97706;';
      case 'discard':
        return 'background: #F3F4F6; color: #6B7280;';
      case 'pending':
        return 'background: #FECACA; color: #DC2626;';
      default:
        return 'background: #E5E7EB; color: #4B5563;';
    }
  }}
`;

const ActionsCell = styled.div`
  display: flex;
  gap: 8px;
`;

interface ActionButtonProps {
  $variant?: 'primary' | 'success' | 'danger';
}

const ActionButton = styled.button<ActionButtonProps>`
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;

  ${({ $variant }) => {
    switch ($variant) {
      case 'primary':
        return 'background: #4a90d9; color: white; &:hover { background: #3a7bc8; }';
      case 'success':
        return 'background: #28a745; color: white; &:hover { background: #218838; }';
      case 'danger':
        return 'background: #dc3545; color: white; &:hover { background: #c82333; }';
      default:
        return 'background: #6c757d; color: white; &:hover { background: #5a6268; }';
    }
  }}
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 48px;
  color: #6c757d;
`;

const PaginationContainer = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-top: 1px solid #e9ecef;
`;

const PaginationInfo = styled.span`
  font-size: 0.875rem;
  color: #6c757d;
`;

const PaginationButtons = styled.div`
  display: flex;
  gap: 8px;
`;

interface PageButtonProps {
  $active?: boolean;
}

const PageButton = styled.button<PageButtonProps>`
  padding: 8px 14px;
  border: 1px solid ${({ $active }) => ($active ? '#4a90d9' : '#ddd')};
  border-radius: 6px;
  background: ${({ $active }) => ($active ? '#4a90d9' : 'white')};
  color: ${({ $active }) => ($active ? 'white' : '#333')};
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.2s;

  &:hover:not(:disabled) {
    background: ${({ $active }) => ($active ? '#3a7bc8' : '#f8f9fa')};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;

const ModalContent = styled.div`
  background: white;
  border-radius: 12px;
  padding: 24px;
  width: 100%;
  max-width: 500px;
  max-height: 90vh;
  overflow-y: auto;
`;

const ModalTitle = styled.h2`
  font-size: 1.25rem;
  font-weight: 600;
  color: #1a1a2e;
  margin: 0 0 20px 0;
`;

const FormGroup = styled.div`
  margin-bottom: 16px;
`;

const FormLabel = styled.label`
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  color: #333;
  margin-bottom: 6px;
`;

const FormSelect = styled.select`
  width: 100%;
  padding: 10px 14px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 0.875rem;
`;

const FormTextarea = styled.textarea`
  width: 100%;
  padding: 10px 14px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 0.875rem;
  min-height: 80px;
  resize: vertical;
`;

const ModalActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 20px;
`;

// Component
const WasteInventoryList: React.FC = () => {
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
    <PageContainer>
      <PageHeader>
        <PageTitle>Waste Inventory</PageTitle>
      </PageHeader>

      {summary && (
        <SummaryGrid>
          <SummaryCard $color="#DC2626">
            <SummaryValue>{formatNumber(summary.totalWasteRecords)}</SummaryValue>
            <SummaryLabel>Total Waste Records</SummaryLabel>
          </SummaryCard>
          <SummaryCard $color="#D97706">
            <SummaryValue>{formatNumber(summary.totalQuantity, { decimals: 2 })}</SummaryValue>
            <SummaryLabel>Total Quantity</SummaryLabel>
          </SummaryCard>
          <SummaryCard $color="#7C3AED">
            <SummaryValue>{formatCurrency(summary.totalEstimatedValue, 'AED')}</SummaryValue>
            <SummaryLabel>Estimated Value Lost</SummaryLabel>
          </SummaryCard>
          <SummaryCard $color="#EF4444">
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
        <ExportButton onClick={handleExport} disabled={exporting}>
          {exporting ? 'Exporting...' : '📥 Export CSV'}
        </ExportButton>
      </FiltersRow>

      <Card>
        {wasteItems.length === 0 ? (
          <EmptyState>
            <p>No waste records found.</p>
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
                        {item.variety && <div style={{ fontSize: '0.75rem', color: '#6c757d' }}>{item.variety}</div>}
                      </TableCell>
                      <TableCell>
                        {formatNumber(item.quantity, { decimals: 2 })} {item.unit}
                      </TableCell>
                      <TableCell>
                        <SourceBadge $type={item.sourceType}>
                          {formatSourceType(item.sourceType)}
                        </SourceBadge>
                      </TableCell>
                      <TableCell style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.wasteReason}
                      </TableCell>
                      <TableCell>{formatDate(item.wasteDate)}</TableCell>
                      <TableCell>
                        <DisposalBadge $method={item.disposalMethod}>
                          {formatDisposalMethod(item.disposalMethod)}
                        </DisposalBadge>
                      </TableCell>
                      <TableCell>
                        {item.estimatedValue ? formatCurrency(item.estimatedValue, 'AED') : '-'}
                      </TableCell>
                      <TableCell>
                        <ActionsCell>
                          <ActionButton $variant="primary" onClick={() => openDisposalModal(item)}>
                            Update
                          </ActionButton>
                          <ActionButton $variant="danger" onClick={() => handleDelete(item.wasteId)}>
                            Delete
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
        <ModalOverlay onClick={() => setShowDisposalModal(false)}>
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
              <Button $variant="secondary" onClick={() => setShowDisposalModal(false)}>
                Cancel
              </Button>
              <Button $variant="primary" onClick={handleUpdateDisposal}>
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
