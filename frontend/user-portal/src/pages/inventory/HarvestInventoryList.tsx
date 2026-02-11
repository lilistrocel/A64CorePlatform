/**
 * Harvest Inventory List
 *
 * Lists and manages harvested products inventory
 */

import { useState, useEffect } from 'react';
import styled from 'styled-components';
import {
  listHarvestInventory,
  createHarvestInventory,
  updateHarvestInventory,
  deleteHarvestInventory,
  exportHarvestInventoryCSV,
} from '../../services/inventoryApi';
import { getFarms } from '../../services/farmApi';
import { getPlantDataEnhancedList } from '../../services/plantDataEnhancedApi';
import { formatNumber, formatCurrency } from '../../utils';
import type {
  HarvestInventory,
  HarvestInventoryCreate,
  QualityGrade,
  PaginatedResponse,
} from '../../types/inventory';
import type { Farm, PlantDataEnhanced } from '../../types/farm';
import { QUALITY_GRADE_LABELS, PRODUCT_TYPE_LABELS } from '../../types/inventory';

interface Props {
  onUpdate?: () => void;
  farmingYear?: number | null;
}

type SortField = 'harvestDate' | 'createdAt' | 'plantName' | 'quantity' | 'qualityGrade';
type SortOrder = 'asc' | 'desc';

export function HarvestInventoryList({ onUpdate, farmingYear }: Props) {
  const [inventory, setInventory] = useState<HarvestInventory[]>([]);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [plantDataList, setPlantDataList] = useState<PlantDataEnhanced[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortField>('harvestDate');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editItem, setEditItem] = useState<HarvestInventory | null>(null);

  useEffect(() => {
    loadData();
  }, [page, search, sortBy, sortOrder, farmingYear]);

  // Reset page to 1 when farming year changes
  useEffect(() => {
    setPage(1);
  }, [farmingYear]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [inventoryData, farmsData, plantData] = await Promise.all([
        listHarvestInventory({ search, sortBy, sortOrder, page, perPage: 20, farmingYear }),
        getFarms(),
        getPlantDataEnhancedList({ perPage: 100 }), // Load all plant data for dropdown
      ]);
      setInventory(inventoryData.items);
      setTotalPages(inventoryData.totalPages);
      setFarms(farmsData.items || []);
      setPlantDataList(plantData.items || []);
    } catch (error) {
      console.error('Failed to load harvest inventory:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      // Toggle sort order if clicking same field
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      // Set new field with descending order by default
      setSortBy(field);
      setSortOrder('desc');
    }
    setPage(1); // Reset to first page on sort
  };

  const getSortIndicator = (field: SortField) => {
    if (sortBy !== field) return '';
    return sortOrder === 'asc' ? ' ▲' : ' ▼';
  };

  const handleDelete = async (item: HarvestInventory) => {
    if (!confirm(`Delete ${item.plantName}? This cannot be undone.`)) return;
    try {
      await deleteHarvestInventory(item.inventoryId);
      loadData();
      onUpdate?.();
    } catch (error) {
      console.error('Failed to delete:', error);
      alert('Failed to delete item');
    }
  };

  const getFarmName = (farmId: string) => {
    const farm = farms.find(f => f.farmId === farmId);
    return farm?.name || 'Unknown Farm';
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString();
  };

  const isExpiringSoon = (expiryDate?: string) => {
    if (!expiryDate) return false;
    const expiry = new Date(expiryDate);
    const now = new Date();
    const daysUntilExpiry = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntilExpiry <= 7 && daysUntilExpiry > 0;
  };

  const isExpired = (expiryDate?: string) => {
    if (!expiryDate) return false;
    return new Date(expiryDate) < new Date();
  };

  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    try {
      setExporting(true);
      await exportHarvestInventoryCSV({ search });
    } catch (error) {
      console.error('Failed to export:', error);
      alert('Failed to export inventory');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Container>
      <Toolbar>
        <SearchInput
          type="text"
          placeholder="Search harvest inventory..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <ToolbarButtons>
          <ExportButton onClick={handleExport} disabled={exporting}>
            {exporting ? 'Exporting...' : '📥 Export CSV'}
          </ExportButton>
          <AddButton onClick={() => setShowAddModal(true)}>+ Add Harvest</AddButton>
        </ToolbarButtons>
      </Toolbar>

      {loading ? (
        <LoadingMessage>Loading inventory...</LoadingMessage>
      ) : inventory.length === 0 ? (
        <EmptyMessage>
          <EmptyIcon>📦</EmptyIcon>
          <EmptyText>No harvest inventory items found</EmptyText>
          <EmptySubtext>Add harvested products to track your inventory</EmptySubtext>
        </EmptyMessage>
      ) : (
        <>
          <Table aria-label="Harvest inventory table">
            <thead>
              <tr>
                <ThSortable
                  scope="col"
                  $active={sortBy === 'plantName'}
                  onClick={() => handleSort('plantName')}
                  aria-sort={sortBy === 'plantName' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  Product<span aria-hidden="true">{getSortIndicator('plantName')}</span>
                </ThSortable>
                <Th scope="col">Farm</Th>
                <ThSortable
                  scope="col"
                  $active={sortBy === 'quantity'}
                  onClick={() => handleSort('quantity')}
                  aria-sort={sortBy === 'quantity' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  Quantity<span aria-hidden="true">{getSortIndicator('quantity')}</span>
                </ThSortable>
                <ThSortable
                  scope="col"
                  $active={sortBy === 'qualityGrade'}
                  onClick={() => handleSort('qualityGrade')}
                  aria-sort={sortBy === 'qualityGrade' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  Grade<span aria-hidden="true">{getSortIndicator('qualityGrade')}</span>
                </ThSortable>
                <ThSortable
                  scope="col"
                  $active={sortBy === 'harvestDate'}
                  onClick={() => handleSort('harvestDate')}
                  aria-sort={sortBy === 'harvestDate' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  Harvest Date<span aria-hidden="true">{getSortIndicator('harvestDate')}</span>
                </ThSortable>
                <Th scope="col">Expiry</Th>
                <Th scope="col">Price</Th>
                <Th scope="col">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {inventory.map((item) => (
                <Tr key={item.inventoryId}>
                  <Td>
                    <ProductInfo>
                      <ProductName>{item.plantName}</ProductName>
                      <ProductType>{PRODUCT_TYPE_LABELS[item.productType]}</ProductType>
                      {item.variety && <ProductVariety>{item.variety}</ProductVariety>}
                    </ProductInfo>
                  </Td>
                  <Td>{getFarmName(item.farmId)}</Td>
                  <Td>
                    <QuantityInfo>
                      <QuantityValue>{formatNumber(item.availableQuantity, { decimals: 2 })} {item.unit}</QuantityValue>
                      {item.reservedQuantity > 0 && (
                        <ReservedBadge>{formatNumber(item.reservedQuantity, { decimals: 2 })} reserved</ReservedBadge>
                      )}
                    </QuantityInfo>
                  </Td>
                  <Td>
                    <GradeBadge $grade={item.qualityGrade}>
                      {QUALITY_GRADE_LABELS[item.qualityGrade]}
                    </GradeBadge>
                  </Td>
                  <Td>{formatDate(item.harvestDate)}</Td>
                  <Td>
                    {item.expiryDate ? (
                      <ExpiryDate
                        $expired={isExpired(item.expiryDate)}
                        $expiringSoon={isExpiringSoon(item.expiryDate)}
                      >
                        {formatDate(item.expiryDate)}
                        {isExpired(item.expiryDate) && ' (Expired)'}
                        {isExpiringSoon(item.expiryDate) && ' (Soon)'}
                      </ExpiryDate>
                    ) : (
                      '-'
                    )}
                  </Td>
                  <Td>
                    {item.unitPrice
                      ? `${formatCurrency(item.unitPrice, item.currency)}/${item.unit}`
                      : '-'}
                  </Td>
                  <Td>
                    <ActionButtons>
                      <ActionButton onClick={() => setEditItem(item)}>Edit</ActionButton>
                      <ActionButton $variant="danger" onClick={() => handleDelete(item)}>
                        Delete
                      </ActionButton>
                    </ActionButtons>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>

          {totalPages > 1 && (
            <Pagination>
              <PageButton disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                Previous
              </PageButton>
              <PageInfo>Page {page} of {totalPages}</PageInfo>
              <PageButton disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
                Next
              </PageButton>
            </Pagination>
          )}
        </>
      )}

      {showAddModal && (
        <AddHarvestModal
          farms={farms}
          plantDataList={plantDataList}
          onClose={() => setShowAddModal(false)}
          onSave={() => {
            setShowAddModal(false);
            loadData();
            onUpdate?.();
          }}
        />
      )}

      {editItem && (
        <EditHarvestModal
          item={editItem}
          onClose={() => setEditItem(null)}
          onSave={() => {
            setEditItem(null);
            loadData();
            onUpdate?.();
          }}
        />
      )}
    </Container>
  );
}

// Add Modal Component
function AddHarvestModal({
  farms,
  plantDataList,
  onClose,
  onSave,
}: {
  farms: Farm[];
  plantDataList: PlantDataEnhanced[];
  onClose: () => void;
  onSave: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState<Partial<HarvestInventoryCreate>>({
    productType: 'fresh',
    qualityGrade: 'grade_a',
    currency: 'AED',
    harvestDate: new Date().toISOString().split('T')[0],
  });

  // Handle plant selection - sets both ID and name
  const handlePlantChange = (plantDataId: string) => {
    const selectedPlant = plantDataList.find(p => p.plantDataId === plantDataId);
    if (selectedPlant) {
      setFormData({
        ...formData,
        plantDataId: selectedPlant.plantDataId,
        plantName: selectedPlant.plantName,
      });
    } else {
      setFormData({
        ...formData,
        plantDataId: '',
        plantName: '',
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.farmId || !formData.plantDataId || !formData.plantName || !formData.quantity || !formData.unit) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      setSubmitting(true);
      await createHarvestInventory({
        ...formData,
        harvestDate: new Date(formData.harvestDate!).toISOString(),
        expiryDate: formData.expiryDate ? new Date(formData.expiryDate).toISOString() : undefined,
      } as HarvestInventoryCreate);
      onSave();
    } catch (error) {
      console.error('Failed to create:', error);
      alert('Failed to create harvest inventory item');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalOverlay onClick={onClose}>
      <ModalContent onClick={(e) => e.stopPropagation()}>
        <ModalHeader>
          <ModalTitle>Add Harvest Inventory</ModalTitle>
          <CloseButton onClick={onClose}>&times;</CloseButton>
        </ModalHeader>
        <ModalBody>
          <Form onSubmit={handleSubmit}>
            <FormRow>
              <FormGroup>
                <Label>Farm *</Label>
                <Select
                  value={formData.farmId || ''}
                  onChange={(e) => setFormData({ ...formData, farmId: e.target.value })}
                  required
                >
                  <option value="">Select farm...</option>
                  {farms.map((farm) => (
                    <option key={farm.farmId} value={farm.farmId}>
                      {farm.name}
                    </option>
                  ))}
                </Select>
              </FormGroup>
              <FormGroup>
                <Label>Plant/Product *</Label>
                <Select
                  value={formData.plantDataId || ''}
                  onChange={(e) => handlePlantChange(e.target.value)}
                  required
                >
                  <option value="">Select plant/crop...</option>
                  {plantDataList.map((plant) => (
                    <option key={plant.plantDataId} value={plant.plantDataId}>
                      {plant.plantName} ({plant.plantType})
                    </option>
                  ))}
                </Select>
              </FormGroup>
            </FormRow>

            <FormRow>
              <FormGroup>
                <Label>Quantity *</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  value={formData.quantity || ''}
                  onChange={(e) => setFormData({ ...formData, quantity: parseFloat(e.target.value) })}
                  required
                />
              </FormGroup>
              <FormGroup>
                <Label>Unit *</Label>
                <Input
                  type="text"
                  placeholder="kg, units, bunches"
                  value={formData.unit || ''}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  required
                />
              </FormGroup>
            </FormRow>

            <FormRow>
              <FormGroup>
                <Label>Product Type</Label>
                <Select
                  value={formData.productType || 'fresh'}
                  onChange={(e) => setFormData({ ...formData, productType: e.target.value as any })}
                >
                  {Object.entries(PRODUCT_TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </Select>
              </FormGroup>
              <FormGroup>
                <Label>Quality Grade</Label>
                <Select
                  value={formData.qualityGrade || 'grade_a'}
                  onChange={(e) => setFormData({ ...formData, qualityGrade: e.target.value as any })}
                >
                  {Object.entries(QUALITY_GRADE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </Select>
              </FormGroup>
            </FormRow>

            <FormRow>
              <FormGroup>
                <Label>Harvest Date *</Label>
                <Input
                  type="date"
                  value={formData.harvestDate || ''}
                  onChange={(e) => setFormData({ ...formData, harvestDate: e.target.value })}
                  required
                />
              </FormGroup>
              <FormGroup>
                <Label>Expiry Date</Label>
                <Input
                  type="date"
                  value={formData.expiryDate || ''}
                  onChange={(e) => setFormData({ ...formData, expiryDate: e.target.value })}
                />
              </FormGroup>
            </FormRow>

            <FormRow>
              <FormGroup>
                <Label>Unit Price</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.unitPrice || ''}
                  onChange={(e) => setFormData({ ...formData, unitPrice: parseFloat(e.target.value) })}
                />
              </FormGroup>
              <FormGroup>
                <Label>Storage Location</Label>
                <Input
                  type="text"
                  placeholder="e.g., Cold Storage A"
                  value={formData.storageLocation || ''}
                  onChange={(e) => setFormData({ ...formData, storageLocation: e.target.value })}
                />
              </FormGroup>
            </FormRow>

            <FormGroup>
              <Label>Notes</Label>
              <TextArea
                placeholder="Additional notes..."
                value={formData.notes || ''}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
              />
            </FormGroup>

            <ModalFooter>
              <CancelButton type="button" onClick={onClose}>Cancel</CancelButton>
              <SubmitButton type="submit" disabled={submitting}>
                {submitting ? 'Saving...' : 'Add to Inventory'}
              </SubmitButton>
            </ModalFooter>
          </Form>
        </ModalBody>
      </ModalContent>
    </ModalOverlay>
  );
}

// Edit Modal Component (simplified)
function EditHarvestModal({
  item,
  onClose,
  onSave,
}: {
  item: HarvestInventory;
  onClose: () => void;
  onSave: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [quantity, setQuantity] = useState(item.quantity);
  const [qualityGrade, setQualityGrade] = useState(item.qualityGrade);
  const [unitPrice, setUnitPrice] = useState(item.unitPrice || 0);
  const [notes, setNotes] = useState(item.notes || '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      await updateHarvestInventory(item.inventoryId, {
        quantity,
        qualityGrade,
        unitPrice,
        notes,
      });
      onSave();
    } catch (error) {
      console.error('Failed to update:', error);
      alert('Failed to update item');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalOverlay onClick={onClose}>
      <ModalContent onClick={(e) => e.stopPropagation()}>
        <ModalHeader>
          <ModalTitle>Edit: {item.plantName}</ModalTitle>
          <CloseButton onClick={onClose}>&times;</CloseButton>
        </ModalHeader>
        <ModalBody>
          <Form onSubmit={handleSubmit}>
            <FormRow>
              <FormGroup>
                <Label>Quantity</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={quantity}
                  onChange={(e) => setQuantity(parseFloat(e.target.value))}
                />
              </FormGroup>
              <FormGroup>
                <Label>Quality Grade</Label>
                <Select
                  value={qualityGrade}
                  onChange={(e) => setQualityGrade(e.target.value as QualityGrade)}
                >
                  {Object.entries(QUALITY_GRADE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </Select>
              </FormGroup>
            </FormRow>

            <FormGroup>
              <Label>Unit Price ({item.currency})</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={unitPrice}
                onChange={(e) => setUnitPrice(parseFloat(e.target.value))}
              />
            </FormGroup>

            <FormGroup>
              <Label>Notes</Label>
              <TextArea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </FormGroup>

            <ModalFooter>
              <CancelButton type="button" onClick={onClose}>Cancel</CancelButton>
              <SubmitButton type="submit" disabled={submitting}>
                {submitting ? 'Saving...' : 'Save Changes'}
              </SubmitButton>
            </ModalFooter>
          </Form>
        </ModalBody>
      </ModalContent>
    </ModalOverlay>
  );
}

// Styled Components
const Container = styled.div``;

const Toolbar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: ${({ theme }) => theme.spacing.lg};
  gap: ${({ theme }) => theme.spacing.md};
  flex-wrap: wrap;
`;

const SearchInput = styled.input`
  flex: 1;
  min-width: 200px;
  max-width: 400px;
  padding: ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSize.base};

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary[500]};
  }
`;

const ToolbarButtons = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
  align-items: center;
`;

const ExportButton = styled.button`
  padding: ${({ theme }) => theme.spacing.md} ${({ theme }) => theme.spacing.lg};
  background: ${({ theme }) => theme.colors.neutral[100]};
  color: ${({ theme }) => theme.colors.textPrimary};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  cursor: pointer;
  transition: all 0.2s;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.neutral[200]};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const AddButton = styled.button`
  padding: ${({ theme }) => theme.spacing.md} ${({ theme }) => theme.spacing.lg};
  background: ${({ theme }) => theme.colors.primary[500]};
  color: white;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  cursor: pointer;
  transition: background 0.2s;

  &:hover {
    background: ${({ theme }) => theme.colors.primary[600]};
  }
`;

const LoadingMessage = styled.div`
  text-align: center;
  padding: ${({ theme }) => theme.spacing['2xl']};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const EmptyMessage = styled.div`
  text-align: center;
  padding: ${({ theme }) => theme.spacing['3xl']};
`;

const EmptyIcon = styled.div`
  font-size: 4rem;
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const EmptyText = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.lg};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin-bottom: ${({ theme }) => theme.spacing.sm};
`;

const EmptySubtext = styled.div`
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  background: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  overflow: hidden;
  box-shadow: ${({ theme }) => theme.shadows.sm};
`;

const Th = styled.th`
  text-align: left;
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.neutral[100]};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[200]};
`;

const ThSortable = styled(Th)<{ $active?: boolean }>`
  cursor: pointer;
  user-select: none;
  transition: background 0.15s ease, color 0.15s ease;

  &:hover {
    background: ${({ theme }) => theme.colors.neutral[200]};
    color: ${({ theme }) => theme.colors.textPrimary};
  }

  ${({ $active, theme }) => $active && `
    background: ${theme.colors.neutral[200]};
    color: ${theme.colors.primary[600]};
  `}
`;

const Tr = styled.tr`
  &:hover {
    background: ${({ theme }) => theme.colors.neutral[50]};
  }
`;

const Td = styled.td`
  padding: ${({ theme }) => theme.spacing.md};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[100]};
  vertical-align: middle;
`;

const ProductInfo = styled.div``;

const ProductName = styled.div`
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const ProductType = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const ProductVariety = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-style: italic;
`;

const QuantityInfo = styled.div``;

const QuantityValue = styled.div`
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
`;

const ReservedBadge = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  color: ${({ theme }) => theme.colors.warning};
`;

interface GradeBadgeProps {
  $grade: QualityGrade;
}

const GradeBadge = styled.span<GradeBadgeProps>`
  display: inline-block;
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  background: ${({ theme, $grade }) => {
    switch ($grade) {
      case 'premium': return theme.colors.primary[100];
      case 'grade_a': return theme.colors.success + '20';
      case 'grade_b': return theme.colors.warning + '20';
      case 'grade_c': return theme.colors.neutral[200];
      case 'processing': return theme.colors.neutral[300];
      case 'rejected': return theme.colors.error + '20';
      default: return theme.colors.neutral[200];
    }
  }};
  color: ${({ theme, $grade }) => {
    switch ($grade) {
      case 'premium': return theme.colors.primary[700];
      case 'grade_a': return theme.colors.success;
      case 'grade_b': return theme.colors.warning;
      case 'rejected': return theme.colors.error;
      default: return theme.colors.textSecondary;
    }
  }};
`;

interface ExpiryDateProps {
  $expired: boolean;
  $expiringSoon: boolean;
}

const ExpiryDate = styled.span<ExpiryDateProps>`
  color: ${({ theme, $expired, $expiringSoon }) =>
    $expired ? theme.colors.error : $expiringSoon ? theme.colors.warning : 'inherit'};
  font-weight: ${({ $expired, $expiringSoon }) =>
    $expired || $expiringSoon ? '500' : 'normal'};
`;

const ActionButtons = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
`;

interface ActionButtonProps {
  $variant?: 'danger';
}

const ActionButton = styled.button<ActionButtonProps>`
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  background: ${({ theme, $variant }) =>
    $variant === 'danger' ? theme.colors.error + '10' : theme.colors.neutral[100]};
  color: ${({ theme, $variant }) =>
    $variant === 'danger' ? theme.colors.error : theme.colors.textSecondary};
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: ${({ theme, $variant }) =>
      $variant === 'danger' ? theme.colors.error + '20' : theme.colors.neutral[200]};
  }
`;

const Pagination = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
  margin-top: ${({ theme }) => theme.spacing.lg};
`;

const PageButton = styled.button`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.neutral[100]};
  }
`;

const PageInfo = styled.span`
  color: ${({ theme }) => theme.colors.textSecondary};
`;

// Modal Styles
const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: ${({ theme }) => theme.spacing.lg};
`;

const ModalContent = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  width: 100%;
  max-width: 600px;
  max-height: 90vh;
  overflow-y: auto;
`;

const ModalHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: ${({ theme }) => theme.spacing.lg};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[200]};
`;

const ModalTitle = styled.h2`
  margin: 0;
  font-size: ${({ theme }) => theme.typography.fontSize.xl};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.textSecondary};

  &:hover {
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

const ModalBody = styled.div`
  padding: ${({ theme }) => theme.spacing.lg};
`;

const ModalFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.spacing.md};
  margin-top: ${({ theme }) => theme.spacing.lg};
`;

const Form = styled.form``;

const FormRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: ${({ theme }) => theme.spacing.md};

  @media (max-width: 500px) {
    grid-template-columns: 1fr;
  }
`;

const FormGroup = styled.div`
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const Label = styled.label`
  display: block;
  margin-bottom: ${({ theme }) => theme.spacing.xs};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const Input = styled.input`
  width: 100%;
  padding: ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  background-color: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.textPrimary};

  &::placeholder {
    color: ${({ theme }) => theme.colors.neutral[600]};
    opacity: 1;
  }

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary[500]};
  }
`;

const Select = styled.select`
  width: 100%;
  padding: ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  background-color: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.textPrimary};

  option {
    background-color: ${({ theme }) => theme.colors.background};
    color: ${({ theme }) => theme.colors.textPrimary};
  }

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary[500]};
  }
`;

const TextArea = styled.textarea`
  width: 100%;
  padding: ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  background-color: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.textPrimary};
  resize: vertical;

  &::placeholder {
    color: ${({ theme }) => theme.colors.neutral[600]};
    opacity: 1;
  }

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary[500]};
  }
`;

const CancelButton = styled.button`
  padding: ${({ theme }) => theme.spacing.md} ${({ theme }) => theme.spacing.lg};
  background: ${({ theme }) => theme.colors.neutral[100]};
  color: ${({ theme }) => theme.colors.textSecondary};
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  cursor: pointer;

  &:hover {
    background: ${({ theme }) => theme.colors.neutral[200]};
  }
`;

const SubmitButton = styled.button`
  padding: ${({ theme }) => theme.spacing.md} ${({ theme }) => theme.spacing.lg};
  background: ${({ theme }) => theme.colors.primary[500]};
  color: white;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  cursor: pointer;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.primary[600]};
  }

  &:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }
`;
