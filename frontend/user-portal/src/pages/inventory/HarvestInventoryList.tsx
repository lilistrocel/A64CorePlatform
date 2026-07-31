/**
 * Harvest Inventory List
 *
 * Lists and manages harvested products inventory
 *
 * Night Observatory (T-901 Phase 3, spec Docs/2-Working-Progress/night-observatory-spec.md):
 * visual reskin only — glass table/controls, Space Mono metadata, shared
 * PageHeader/Button, lucide icons in place of emoji. Logic, routes,
 * data-fetching, props and state are unchanged. Always rendered `embedded`
 * from StockPage today (see StockPage.tsx) — PageHeader is gated on
 * `!embedded` so a future standalone route still gets one, without
 * duplicating StockPage's own header in the current usage.
 */

import { useState, useEffect } from 'react';
import styled, { css } from 'styled-components';
import { Inbox, Plus, Pencil, Trash2, X } from 'lucide-react';
import { PageHeader, Button, glassPanel, glassControl, monoLabel, phaseBadge } from '@a64core/shared';
import type { PhaseKey } from '@a64core/shared';
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
} from '../../types/inventory';
import type { Farm, PlantDataEnhanced } from '../../types/farm';
import { QUALITY_GRADE_LABELS, PRODUCT_TYPE_LABELS } from '../../types/inventory';

// Status derived client-side from quantity fields
export type HarvestStockStatus = 'available' | 'reserved' | 'sold' | 'expired';

function deriveStatus(item: HarvestInventory): HarvestStockStatus {
  if (item.expiryDate && new Date(item.expiryDate) < new Date()) return 'expired';
  if (item.availableQuantity > 0) return 'available';
  if (item.reservedQuantity > 0) return 'reserved';
  return 'sold';
}

// Quality-grade -> phase colour map (spec §5.2 extrapolation). Quality grade
// is a QC rating applied to stock that is already harvested, not a literal
// "in harvest phase" event, so `phase.harvesting` (gold) is deliberately NOT
// used here — gold stays reserved for the PageHeader and the page's one
// primary CTA (spec §3 gold budget). `rejected` -> quarantined and
// `processing` -> cleaning are direct semantic matches from §5.2; the
// remaining four tiers are ordered highest-to-lowest along the same
// lifecycle-ish ramp used elsewhere (fruiting -> resting -> colonizing ->
// empty) so all six grades stay perceptually distinct in a dense table.
const QUALITY_GRADE_PHASE: Record<QualityGrade, PhaseKey> = {
  premium: 'fruiting',
  grade_a: 'resting',
  grade_b: 'colonizing',
  grade_c: 'empty',
  processing: 'cleaning',
  rejected: 'quarantined',
};

interface Props {
  onUpdate?: () => void;
  farmingYear?: number | null;
  /** When true, suppresses the outer Container padding so the Stock page wraps it */
  embedded?: boolean;
  /** When set, only rows matching this derived status are shown */
  statusFilter?: HarvestStockStatus | null;
}

type SortField = 'harvestDate' | 'createdAt' | 'plantName' | 'quantity' | 'qualityGrade';
type SortOrder = 'asc' | 'desc';

export function HarvestInventoryList({ onUpdate, farmingYear, embedded = false, statusFilter = null }: Props) {
  const [inventory, setInventory] = useState<HarvestInventory[]>([]);
  const [total, setTotal] = useState(0);
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
      setTotal(inventoryData.total);
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

  // Apply status filter to the fetched items (client-side derived status)
  const visibleInventory = statusFilter
    ? inventory.filter((item) => deriveStatus(item) === statusFilter)
    : inventory;

  // Page-level stat for the PageHeader — derived from the currently loaded
  // page of results, same data the table itself renders.
  const availableCount = inventory.filter((item) => deriveStatus(item) === 'available').length;

  return (
    <Container $embedded={embedded}>
      {!embedded && (
        <PageHeader
          breadcrumb="Inventory · Live"
          title="Harvest Inventory"
          emphasizeLastWord
          description="Track harvested product lots from picking through sale or expiry."
          stats={[
            { value: total, label: 'Total Lots' },
            { value: availableCount, label: 'Available', alive: true },
          ]}
        />
      )}

      <Toolbar>
        <SearchInput
          type="text"
          placeholder="Search harvest inventory..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <ToolbarButtons>
          <Button variant="secondary" size="small" onClick={handleExport} disabled={exporting}>
            <Inbox size={16} strokeWidth={1.8} />
            {exporting ? 'Exporting…' : 'Export CSV'}
          </Button>
          <Button variant="primary" size="small" onClick={() => setShowAddModal(true)}>
            <Plus size={16} strokeWidth={2} />
            Add Harvest
          </Button>
        </ToolbarButtons>
      </Toolbar>

      {loading ? (
        <LoadingMessage>Loading inventory…</LoadingMessage>
      ) : visibleInventory.length === 0 ? (
        <EmptyState>
          <EmptyHeadline>No harvest inventory found</EmptyHeadline>
          <EmptyBody>Add harvested products to start tracking lots through sale or expiry.</EmptyBody>
          <Button variant="secondary" size="small" onClick={() => setShowAddModal(true)}>
            <Plus size={16} strokeWidth={2} />
            Add Harvest
          </Button>
        </EmptyState>
      ) : (
        <>
          <TableWrapper>
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
                {visibleInventory.map((item) => (
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
                    <Td>
                      <MonoText>{formatDate(item.harvestDate)}</MonoText>
                    </Td>
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
                      <MonoText>
                        {item.unitPrice
                          ? `${formatCurrency(item.unitPrice, item.currency)}/${item.unit}`
                          : '-'}
                      </MonoText>
                    </Td>
                    <Td>
                      <ActionButtons>
                        <ActionButton onClick={() => setEditItem(item)} aria-label={`Edit ${item.plantName}`}>
                          <Pencil size={13} strokeWidth={1.8} /> Edit
                        </ActionButton>
                        <ActionButton $variant="danger" onClick={() => handleDelete(item)} aria-label={`Delete ${item.plantName}`}>
                          <Trash2 size={13} strokeWidth={1.8} /> Delete
                        </ActionButton>
                      </ActionButtons>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrapper>

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
    <ModalOverlay>
      <ModalContent onClick={(e) => e.stopPropagation()}>
        <ModalHeader>
          <ModalTitle>Add Harvest Inventory</ModalTitle>
          <CloseButton onClick={onClose} aria-label="Close">
            <X size={20} strokeWidth={1.8} />
          </CloseButton>
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
              <Button type="button" variant="secondary" size="small" onClick={onClose}>Cancel</Button>
              <Button type="submit" variant="primary" size="small" disabled={submitting}>
                {submitting ? 'Saving...' : 'Add to Inventory'}
              </Button>
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
    <ModalOverlay>
      <ModalContent onClick={(e) => e.stopPropagation()}>
        <ModalHeader>
          <ModalTitle>Edit: {item.plantName}</ModalTitle>
          <CloseButton onClick={onClose} aria-label="Close">
            <X size={20} strokeWidth={1.8} />
          </CloseButton>
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
              <Button type="button" variant="secondary" size="small" onClick={onClose}>Cancel</Button>
              <Button type="submit" variant="primary" size="small" disabled={submitting}>
                {submitting ? 'Saving...' : 'Save Changes'}
              </Button>
            </ModalFooter>
          </Form>
        </ModalBody>
      </ModalContent>
    </ModalOverlay>
  );
}

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
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
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

const ToolbarButtons = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
  align-items: center;
`;

const LoadingMessage = styled.div`
  ${monoLabel}
  text-align: center;
  padding: 48px;
  font-size: 0.8rem;
  color: ${({ theme }) => theme.colors.muted};
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
  font-size: 1.3rem;
  color: ${({ theme }) => theme.colors.celeste};
  margin: 0;
`;

const EmptyBody = styled.p`
  color: ${({ theme }) => theme.colors.muted};
  font-size: 0.9rem;
  margin: 0;
  max-width: 360px;
`;

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
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const MonoText = styled.span`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: 0.82rem;
`;

const ProductInfo = styled.div``;

const ProductName = styled.div`
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const ProductType = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.muted};
`;

const ProductVariety = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  color: ${({ theme }) => theme.colors.muted};
  font-style: italic;
`;

const QuantityInfo = styled.div``;

const QuantityValue = styled.div`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: 0.85rem;
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

// Reserved qty reads as "pending allocation", not a warning — routed through
// the pending phase colour (terra) rather than `theme.colors.warning`, which
// is gold-b (the same hex as `phase.harvesting`); using it here would spend
// the page's gold budget once per row with a reservation.
const ReservedBadge = styled.div`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: 0.72rem;
  color: ${({ theme }) => theme.colors.phase.fruitingInit};
`;

interface GradeBadgeProps {
  $grade: QualityGrade;
}

const GradeBadge = styled.span<GradeBadgeProps>`
  ${({ $grade }) => phaseBadge(QUALITY_GRADE_PHASE[$grade])}
`;

interface ExpiryDateProps {
  $expired: boolean;
  $expiringSoon: boolean;
}

// expired -> quarantined (spec §5.2 lists "expired" directly under this
// phase); expiringSoon -> fruitingInit (needs attention, not yet failed).
const ExpiryDate = styled.span<ExpiryDateProps>`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: 0.82rem;
  color: ${({ theme, $expired, $expiringSoon }) =>
    $expired
      ? theme.colors.phase.quarantined
      : $expiringSoon
        ? theme.colors.phase.fruitingInit
        : theme.colors.textPrimary};
  font-weight: ${({ $expired, $expiringSoon }) => ($expired || $expiringSoon ? 700 : 400)};
`;

const ActionButtons = styled.div`
  display: flex;
  gap: 6px;
`;

interface ActionButtonProps {
  $variant?: 'danger';
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
  padding: 6px 10px;
  background: transparent;
  color: ${({ theme }) => theme.colors.celeste};
  border: 1px solid transparent;
  border-radius: 8px;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: rgba(180, 200, 220, 0.07);
    color: ${({ theme }) => theme.colors.textPrimary};
  }

  ${({ $variant }) => $variant === 'danger' && dangerAction}
`;

const Pagination = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
  margin-top: ${({ theme }) => theme.spacing.lg};
`;

const PageButton = styled.button`
  ${glassControl}
  padding: 8px 16px;
  font-size: 0.8rem;
  color: ${({ theme }) => theme.colors.textPrimary};
  cursor: pointer;
  transition: all 0.15s ease;

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.glass.hi};
  }
`;

const PageInfo = styled.span`
  ${monoLabel}
  color: ${({ theme }) => theme.colors.muted};
`;

// ── Modal styles ────────────────────────────────────────────────────────────

const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(10, 14, 36, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: ${({ theme }) => theme.spacing.lg};
`;

const ModalContent = styled.div`
  ${glassPanel}
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border-radius: 20px;
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
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
`;

const ModalTitle = styled.h2`
  margin: 0;
  font-size: ${({ theme }) => theme.typography.fontSize.xl};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
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
  transition: color 0.15s ease;

  &:hover {
    color: ${({ theme }) => theme.colors.bright.coral};
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
  ${monoLabel}
  display: block;
  margin-bottom: ${({ theme }) => theme.spacing.xs};
  color: ${({ theme }) => theme.colors.celeste};
`;

const Input = styled.input`
  ${glassControl}
  width: 100%;
  padding: 10px 14px;
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  color: ${({ theme }) => theme.colors.textPrimary};

  &::placeholder {
    color: ${({ theme }) => theme.colors.muted};
    opacity: 1;
  }

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
`;

const Select = styled.select`
  ${glassControl}
  width: 100%;
  padding: 10px 14px;
  font-size: ${({ theme }) => theme.typography.fontSize.base};
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

const TextArea = styled.textarea`
  ${glassControl}
  width: 100%;
  padding: 10px 14px;
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  color: ${({ theme }) => theme.colors.textPrimary};
  resize: vertical;

  &::placeholder {
    color: ${({ theme }) => theme.colors.muted};
    opacity: 1;
  }

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
`;
