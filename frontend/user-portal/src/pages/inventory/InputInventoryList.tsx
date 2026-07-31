/**
 * Input Inventory List
 *
 * Lists and manages input materials (fertilizers, pesticides, seeds, etc.)
 */

import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { Download, FlaskConical } from 'lucide-react';
import { PageHeader, glassPanel, glassControl, monoLabel, phaseBadge } from '@a64core/shared';
import type { PhaseKey } from '@a64core/shared';
import {
  listInputInventory,
  createInputInventory,
  updateInputInventory,
  deleteInputInventory,
  useInputInventory,
  exportInputInventoryCSV,
} from '../../services/inventoryApi';
import { getFarms } from '../../services/farmApi';
import { formatNumber } from '../../utils';
import type {
  InputInventory,
  InputInventoryCreate,
  InputCategory,
  PaginatedResponse,
} from '../../types/inventory';
import type { Farm } from '../../types/farm';
import {
  INPUT_CATEGORY_LABELS,
  getUnitsForCategory,
  getDefaultUnitForCategory,
} from '../../types/inventory';

// Night Observatory (T-901): input-inventory status -> phase colour map (spec
// §5.2 extrapolation). Same value -> same phase colour everywhere in this
// file (badge here; expiry-date text below reuses the same two extremes).
// isLowStock:false ("in stock") reads as a healthy/approved state -> fruiting.
// isLowStock:true ("low stock") reads as "on hold, needs attention" -> the
// spec's own worked example ("low/warning -> fruitingInit or maintenance");
// maintenance (rose) is used here to stay visually distinct from the
// "expiring soon" terra used below.
const STOCK_STATUS_PHASE: Record<'ok' | 'low', PhaseKey> = {
  ok: 'fruiting',
  low: 'maintenance',
};

interface Props {
  onUpdate?: () => void;
  /**
   * T-901 gold audit: InventoryDashboard renders its own PageHeader and
   * mounts this list inside its content area at `/inventory/input`. Without
   * this flag both PageHeaders render at once — two full sets of gold stat
   * tiles/thread on one screen, well over the spec §3 gold budget. Standalone
   * callers (if any are added later) keep the header; the embedded case
   * suppresses it and relies on the parent's.
   */
  embedded?: boolean;
}

export function InputInventoryList({ onUpdate, embedded = false }: Props) {
  const [inventory, setInventory] = useState<InputInventory[]>([]);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  // Night Observatory (T-901): total item count for the PageHeader stat tile
  // — the field is already returned by listInputInventory(), just not
  // previously stored. No new fetch.
  const [totalItems, setTotalItems] = useState(0);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<InputCategory | ''>('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editItem, setEditItem] = useState<InputInventory | null>(null);
  const [useItem, setUseItem] = useState<InputInventory | null>(null);

  useEffect(() => {
    loadData();
  }, [page, search, categoryFilter, lowStockOnly]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [inventoryData, farmsData] = await Promise.all([
        listInputInventory({
          search,
          category: categoryFilter || undefined,
          lowStockOnly,
          page,
          perPage: 20,
        }),
        getFarms(),
      ]);
      setInventory(inventoryData.items);
      setTotalPages(inventoryData.totalPages);
      setTotalItems(inventoryData.total);
      setFarms(farmsData.items || []);
    } catch (error) {
      console.error('Failed to load input inventory:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (item: InputInventory) => {
    if (!confirm(`Delete ${item.itemName}? This cannot be undone.`)) return;
    try {
      await deleteInputInventory(item.inventoryId);
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

  const isExpired = (expiryDate?: string) => {
    if (!expiryDate) return false;
    return new Date(expiryDate) < new Date();
  };

  const isExpiringSoon = (expiryDate?: string) => {
    if (!expiryDate) return false;
    const expiry = new Date(expiryDate);
    const now = new Date();
    const daysUntilExpiry = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntilExpiry <= 30 && daysUntilExpiry > 0;
  };

  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    try {
      setExporting(true);
      await exportInputInventoryCSV({
        search,
        category: categoryFilter || undefined,
        lowStockOnly,
      });
    } catch (error) {
      console.error('Failed to export:', error);
      alert('Failed to export inventory');
    } finally {
      setExporting(false);
    }
  };

  const inStockOnPage = inventory.filter((item) => !item.isLowStock).length;

  return (
    <Container>
      {!embedded && (
        <PageHeader
          title="Input Inventory"
          emphasizeLastWord
          description="Fertilizers, seeds, and other consumable inputs"
          stats={[
            { value: loading ? '...' : formatNumber(totalItems), label: 'Total Items' },
            { value: loading ? '...' : formatNumber(inStockOnPage), label: 'In Stock', alive: true },
          ]}
        />
      )}

      <Toolbar>
        <SearchInput
          type="text"
          placeholder="Search inputs..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <FilterGroup>
          <Select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as InputCategory | '')}
          >
            <option value="">All Categories</option>
            {Object.entries(INPUT_CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
          <CheckboxLabel>
            <input
              type="checkbox"
              checked={lowStockOnly}
              onChange={(e) => setLowStockOnly(e.target.checked)}
            />
            Low Stock Only
          </CheckboxLabel>
        </FilterGroup>
        <ToolbarButtons>
          <ExportButton onClick={handleExport} disabled={exporting}>
            <Download size={14} strokeWidth={1.8} />
            {exporting ? 'Exporting...' : 'Export CSV'}
          </ExportButton>
          <AddButton onClick={() => setShowAddModal(true)}>+ Add Input</AddButton>
        </ToolbarButtons>
      </Toolbar>

      {loading ? (
        <LoadingMessage>Loading inventory...</LoadingMessage>
      ) : inventory.length === 0 ? (
        <EmptyMessage>
          <EmptyIcon><FlaskConical size={48} strokeWidth={1.3} /></EmptyIcon>
          <EmptyText>No input inventory items found</EmptyText>
          <EmptySubtext>Add fertilizers, seeds, and other inputs</EmptySubtext>
          <EmptyAction onClick={() => setShowAddModal(true)}>+ Add Input</EmptyAction>
        </EmptyMessage>
      ) : (
        <>
          <Table aria-label="Input inventory table">
            <thead>
              <tr>
                <Th scope="col">Item</Th>
                <Th scope="col">Category</Th>
                <Th scope="col">Farm</Th>
                <Th scope="col">Quantity</Th>
                <Th scope="col">Status</Th>
                <Th scope="col">Supplier</Th>
                <Th scope="col">Expiry</Th>
                <Th scope="col">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {inventory.map((item) => (
                <Tr key={item.inventoryId}>
                  <Td>
                    <ItemInfo>
                      <ItemName>{item.itemName}</ItemName>
                      {item.brand && <ItemBrand>{item.brand}</ItemBrand>}
                      {item.sku && <ItemSku>SKU: {item.sku}</ItemSku>}
                    </ItemInfo>
                  </Td>
                  <Td>
                    <CategoryBadge>
                      {INPUT_CATEGORY_LABELS[item.category]}
                    </CategoryBadge>
                  </Td>
                  <Td>{getFarmName(item.farmId)}</Td>
                  <Td>
                    <QuantityInfo>
                      <QuantityValue>{formatNumber(item.quantity, { decimals: 2 })} {item.unit}</QuantityValue>
                      <MinStock>Min: {formatNumber(item.minimumStock, { decimals: 2 })} {item.unit}</MinStock>
                    </QuantityInfo>
                  </Td>
                  <Td>
                    {item.isLowStock ? (
                      <StatusBadge $status="low">Low Stock</StatusBadge>
                    ) : (
                      <StatusBadge $status="ok">In Stock</StatusBadge>
                    )}
                  </Td>
                  <Td>{item.supplier || '-'}</Td>
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
                    <ActionButtons>
                      <ActionButton onClick={() => setUseItem(item)}>Use</ActionButton>
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
        <AddInputModal
          farms={farms}
          onClose={() => setShowAddModal(false)}
          onSave={() => {
            setShowAddModal(false);
            loadData();
            onUpdate?.();
          }}
        />
      )}

      {editItem && (
        <EditInputModal
          item={editItem}
          onClose={() => setEditItem(null)}
          onSave={() => {
            setEditItem(null);
            loadData();
            onUpdate?.();
          }}
        />
      )}

      {useItem && (
        <UseInputModal
          item={useItem}
          onClose={() => setUseItem(null)}
          onSave={() => {
            setUseItem(null);
            loadData();
            onUpdate?.();
          }}
        />
      )}
    </Container>
  );
}

// Add Modal
function AddInputModal({
  farms,
  onClose,
  onSave,
}: {
  farms: Farm[];
  onClose: () => void;
  onSave: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const defaultCategory: InputCategory = 'fertilizer';
  const [formData, setFormData] = useState<Partial<InputInventoryCreate>>({
    category: defaultCategory,
    unit: getDefaultUnitForCategory(defaultCategory),
    currency: 'AED',
    minimumStock: 0,
  });

  // Get available units for the selected category
  const availableUnits = getUnitsForCategory(formData.category || 'fertilizer');

  // Handle category change - update unit to default for new category
  const handleCategoryChange = (newCategory: InputCategory) => {
    const defaultUnit = getDefaultUnitForCategory(newCategory);
    setFormData({
      ...formData,
      category: newCategory,
      unit: defaultUnit,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.farmId || !formData.itemName || !formData.quantity || !formData.unit) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      setSubmitting(true);
      await createInputInventory(formData as InputInventoryCreate);
      onSave();
    } catch (error) {
      console.error('Failed to create:', error);
      alert('Failed to create input inventory item');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalOverlay>
      <ModalContent onClick={(e) => e.stopPropagation()}>
        <ModalHeader>
          <ModalTitle>Add Input Inventory</ModalTitle>
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
                <Label>Category *</Label>
                <Select
                  value={formData.category || 'fertilizer'}
                  onChange={(e) => handleCategoryChange(e.target.value as InputCategory)}
                >
                  {Object.entries(INPUT_CATEGORY_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </Select>
              </FormGroup>
            </FormRow>

            <FormRow>
              <FormGroup>
                <Label>Item Name *</Label>
                <Input
                  type="text"
                  placeholder="e.g., NPK 20-20-20"
                  value={formData.itemName || ''}
                  onChange={(e) => setFormData({ ...formData, itemName: e.target.value })}
                  required
                />
              </FormGroup>
              <FormGroup>
                <Label>Brand</Label>
                <Input
                  type="text"
                  placeholder="e.g., GreenGrow"
                  value={formData.brand || ''}
                  onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                />
              </FormGroup>
            </FormRow>

            <FormRow>
              <FormGroup>
                <Label>Quantity *</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.quantity || ''}
                  onChange={(e) => setFormData({ ...formData, quantity: parseFloat(e.target.value) })}
                  required
                />
              </FormGroup>
              <FormGroup>
                <Label>Unit *</Label>
                <Select
                  value={formData.unit || ''}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  required
                >
                  {availableUnits.map((unit) => (
                    <option key={unit.value} value={unit.value}>
                      {unit.label}
                    </option>
                  ))}
                </Select>
              </FormGroup>
            </FormRow>

            <FormRow>
              <FormGroup>
                <Label>Minimum Stock Level</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.minimumStock || 0}
                  onChange={(e) => setFormData({ ...formData, minimumStock: parseFloat(e.target.value) })}
                />
              </FormGroup>
              <FormGroup>
                <Label>Unit Cost ({formData.currency})</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.unitCost || ''}
                  onChange={(e) => setFormData({ ...formData, unitCost: parseFloat(e.target.value) })}
                />
              </FormGroup>
            </FormRow>

            <FormRow>
              <FormGroup>
                <Label>Supplier</Label>
                <Input
                  type="text"
                  placeholder="Supplier name"
                  value={formData.supplier || ''}
                  onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
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
                <Label>Storage Location</Label>
                <Input
                  type="text"
                  placeholder="e.g., Warehouse B"
                  value={formData.storageLocation || ''}
                  onChange={(e) => setFormData({ ...formData, storageLocation: e.target.value })}
                />
              </FormGroup>
              <FormGroup>
                <Label>Purchase Date</Label>
                <Input
                  type="date"
                  value={formData.purchaseDate || ''}
                  onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })}
                />
              </FormGroup>
            </FormRow>

            <FormGroup>
              <Label>Notes</Label>
              <TextArea
                placeholder="Additional notes, active ingredients, application rate..."
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

// Edit Modal
function EditInputModal({
  item,
  onClose,
  onSave,
}: {
  item: InputInventory;
  onClose: () => void;
  onSave: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [quantity, setQuantity] = useState(item.quantity);
  const [minimumStock, setMinimumStock] = useState(item.minimumStock);
  const [unitCost, setUnitCost] = useState(item.unitCost || 0);
  const [notes, setNotes] = useState(item.notes || '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      await updateInputInventory(item.inventoryId, {
        quantity,
        minimumStock,
        unitCost,
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
          <ModalTitle>Edit: {item.itemName}</ModalTitle>
          <CloseButton onClick={onClose}>&times;</CloseButton>
        </ModalHeader>
        <ModalBody>
          <Form onSubmit={handleSubmit}>
            <FormRow>
              <FormGroup>
                <Label>Quantity ({item.unit})</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={quantity}
                  onChange={(e) => setQuantity(parseFloat(e.target.value))}
                />
              </FormGroup>
              <FormGroup>
                <Label>Minimum Stock ({item.unit})</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={minimumStock}
                  onChange={(e) => setMinimumStock(parseFloat(e.target.value))}
                />
              </FormGroup>
            </FormRow>

            <FormGroup>
              <Label>Unit Cost ({item.currency})</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={unitCost}
                onChange={(e) => setUnitCost(parseFloat(e.target.value))}
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

// Use Modal
function UseInputModal({
  item,
  onClose,
  onSave,
}: {
  item: InputInventory;
  onClose: () => void;
  onSave: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [quantity, setQuantity] = useState(0);
  const [reason, setReason] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (quantity <= 0) {
      alert('Please enter a valid quantity');
      return;
    }
    if (quantity > item.quantity) {
      alert('Quantity exceeds available stock');
      return;
    }

    try {
      setSubmitting(true);
      await useInputInventory(item.inventoryId, quantity, reason || undefined);
      onSave();
    } catch (error) {
      console.error('Failed to record usage:', error);
      alert('Failed to record usage');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalOverlay>
      <ModalContent onClick={(e) => e.stopPropagation()}>
        <ModalHeader>
          <ModalTitle>Use: {item.itemName}</ModalTitle>
          <CloseButton onClick={onClose}>&times;</CloseButton>
        </ModalHeader>
        <ModalBody>
          <CurrentStock>
            Available: <strong>{formatNumber(item.quantity, { decimals: 2 })} {item.unit}</strong>
          </CurrentStock>
          <Form onSubmit={handleSubmit}>
            <FormGroup>
              <Label>Quantity to Use *</Label>
              <Input
                type="number"
                min="0.01"
                max={item.quantity}
                step="0.01"
                value={quantity || ''}
                onChange={(e) => setQuantity(parseFloat(e.target.value))}
                required
              />
            </FormGroup>

            <FormGroup>
              <Label>Reason / Notes</Label>
              <TextArea
                placeholder="e.g., Applied to Block A, Tomato crop"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
              />
            </FormGroup>

            <ModalFooter>
              <CancelButton type="button" onClick={onClose}>Cancel</CancelButton>
              <SubmitButton type="submit" disabled={submitting}>
                {submitting ? 'Recording...' : 'Record Usage'}
              </SubmitButton>
            </ModalFooter>
          </Form>
        </ModalBody>
      </ModalContent>
    </ModalOverlay>
  );
}

// Styled Components
// Night Observatory (T-901): page-level container is transparent — no
// opaque background — so the fixed sky shows through (spec §2).
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
  ${glassControl}
  flex: 1;
  min-width: 200px;
  max-width: 300px;
  padding: ${({ theme }) => theme.spacing.md};
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

const FilterGroup = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
`;

const Select = styled.select`
  ${glassControl}
  padding: ${({ theme }) => theme.spacing.md};
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  color: ${({ theme }) => theme.colors.textPrimary};
  min-width: 150px;

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

const CheckboxLabel = styled.label`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.celeste};
  cursor: pointer;
`;

const ToolbarButtons = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
  align-items: center;
`;

// Secondary button (spec §4 Buttons): glass + glass.border + cream text —
// never gold; gold is reserved for the primary CTA (AddButton below).
const ExportButton = styled.button`
  ${glassControl}
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: ${({ theme }) => theme.spacing.md} ${({ theme }) => theme.spacing.lg};
  color: ${({ theme }) => theme.colors.onDark};
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  cursor: pointer;
  transition: all 0.2s;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.glass.hi};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

// Primary CTA (spec §4 Buttons / §3 gold-discipline budget: "the primary
// FAB/CTA" is an authorised gold element).
const AddButton = styled.button`
  padding: ${({ theme }) => theme.spacing.md} ${({ theme }) => theme.spacing.lg};
  background: linear-gradient(145deg, ${({ theme }) => theme.colors.secondary[300]}, ${({ theme }) => theme.colors.secondary[500]});
  color: ${({ theme }) => theme.colors.onAccent};
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 18px rgba(220, 185, 79, 0.25);
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
    &:hover { transform: none; }
  }
`;

const LoadingMessage = styled.div`
  text-align: center;
  padding: ${({ theme }) => theme.spacing['2xl']};
  color: ${({ theme }) => theme.colors.muted};
`;

const EmptyMessage = styled.div`
  text-align: center;
  padding: ${({ theme }) => theme.spacing['3xl']};
`;

const EmptyIcon = styled.div`
  display: flex;
  justify-content: center;
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const EmptyText = styled.div`
  font-family: ${({ theme }) => theme.typography.fontFamily.display};
  font-style: italic;
  font-weight: 400;
  font-size: ${({ theme }) => theme.typography.fontSize.lg};
  color: ${({ theme }) => theme.colors.celeste};
  margin-bottom: ${({ theme }) => theme.spacing.sm};
`;

const EmptySubtext = styled.div`
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

// T-901 gold audit: this used to duplicate AddButton's gold-gradient
// treatment, but both render on screen together whenever the list is empty
// (toolbar AddButton + this centred empty-state action) — two gold CTAs in
// one view, over spec §3's one-primary-CTA-per-view budget. AddButton
// already carries the sole "primary FAB/CTA" gold slot for this screen, so
// this is demoted to the secondary/glass treatment (spec §4 Buttons), same
// visual family as ExportButton above.
const EmptyAction = styled.button`
  ${glassControl}
  padding: ${({ theme }) => theme.spacing.md} ${({ theme }) => theme.spacing.lg};
  color: ${({ theme }) => theme.colors.onDark};
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
  cursor: pointer;
  margin: 0 auto;
  transition: background 0.2s;

  &:hover {
    background: ${({ theme }) => theme.colors.glass.hi};
  }
`;

// A dense table sits inside ONE glass panel (spec §4 Tables / two-layer
// rule); rows inside stay transparent.
const Table = styled.table`
  ${glassPanel}
  width: 100%;
  border-collapse: collapse;
  overflow: hidden;
`;

const Th = styled.th`
  ${monoLabel}
  text-align: left;
  padding: ${({ theme }) => theme.spacing.md};
  color: ${({ theme }) => theme.colors.celeste};
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
`;

const Tr = styled.tr`
  &:hover {
    background: rgba(180, 200, 220, 0.05);
  }
`;

const Td = styled.td`
  padding: ${({ theme }) => theme.spacing.md};
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  vertical-align: middle;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const ItemInfo = styled.div``;

const ItemName = styled.div`
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const ItemBrand = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.muted};
`;

const ItemSku = styled.div`
  ${monoLabel}
  font-size: 0.68rem;
  color: ${({ theme }) => theme.colors.muted};
`;

const CategoryBadge = styled.span`
  ${monoLabel}
  display: inline-block;
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  border-radius: 99px;
  background: ${({ theme }) => theme.colors.glass.base};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  color: ${({ theme }) => theme.colors.celeste};
`;

const QuantityInfo = styled.div``;

const QuantityValue = styled.div`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const MinStock = styled.div`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  color: ${({ theme }) => theme.colors.muted};
`;

interface StatusBadgeProps {
  $status: 'ok' | 'low';
}

// §4 badge pattern via the shared phaseBadge() mixin — text = phase colour,
// bg = phase 16%, border = phase 45%, glowing dot. See STOCK_STATUS_PHASE
// above for the isLowStock -> phase mapping.
const StatusBadge = styled.span<StatusBadgeProps>`
  ${({ $status }) => phaseBadge(STOCK_STATUS_PHASE[$status])}
`;

interface ExpiryDateProps {
  $expired: boolean;
  $expiringSoon: boolean;
}

// Same extrapolated vocabulary as the stock badge (spec §5.2): expired ->
// quarantined (rejected/failed/overdue/expired), expiring soon ->
// fruitingInit (pending/awaiting attention). Never the raw `warning` token
// here — that resolves to gold-b, and gold is not a status colour.
const ExpiryDate = styled.span<ExpiryDateProps>`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  color: ${({ theme, $expired, $expiringSoon }) =>
    $expired
      ? theme.colors.phase.quarantined
      : $expiringSoon
      ? theme.colors.phase.fruitingInit
      : 'inherit'};
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

// Ghost buttons (spec §4 Buttons): transparent, celeste text/border.
// Destructive variant: coral-tinted glass, never solid red.
const ActionButton = styled.button<ActionButtonProps>`
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  background: ${({ theme, $variant }) =>
    $variant === 'danger' ? 'rgba(240, 138, 112, 0.1)' : 'transparent'};
  color: ${({ theme, $variant }) =>
    $variant === 'danger' ? theme.colors.bright.coral : theme.colors.celeste};
  border: 1px solid ${({ theme, $variant }) =>
    $variant === 'danger' ? 'rgba(240, 138, 112, 0.35)' : theme.colors.glass.border};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: ${({ theme, $variant }) =>
      $variant === 'danger' ? 'rgba(240, 138, 112, 0.18)' : 'rgba(180, 200, 220, 0.07)'};
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
  ${glassControl}
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  color: ${({ theme }) => theme.colors.textPrimary};
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.glass.hi};
  }
`;

const PageInfo = styled.span`
  ${monoLabel}
  color: ${({ theme }) => theme.colors.celeste};
`;

// Modal Styles
// Night Observatory (T-901): scrim retinted to cosmos rgba(10,14,36,.6)
// (spec §4 Modals/drawers); still closes only via the X button (CloseButton)
// — no onClick on the overlay itself, behaviour unchanged.
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
  background: none;
  border: none;
  /* Own padding, not the (now-removed) global button padding — this glyph
     has no explicit width/height, so it needs a real click target. */
  padding: 8px;
  font-size: 1.5rem;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.muted};

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

const CurrentStock = styled.div`
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.glass.base};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
  color: ${({ theme }) => theme.colors.textPrimary};

  strong {
    font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  }
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
  padding: ${({ theme }) => theme.spacing.md};
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

const TextArea = styled.textarea`
  ${glassControl}
  width: 100%;
  padding: ${({ theme }) => theme.spacing.md};
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

// Ghost cancel (spec §4 Buttons): transparent, celeste text/border.
const CancelButton = styled.button`
  padding: ${({ theme }) => theme.spacing.md} ${({ theme }) => theme.spacing.lg};
  background: transparent;
  color: ${({ theme }) => theme.colors.celeste};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  cursor: pointer;

  &:hover {
    background: rgba(180, 200, 220, 0.07);
  }
`;

// Primary CTA — same gold-gradient treatment as AddButton (spec §4 Buttons).
const SubmitButton = styled.button`
  padding: ${({ theme }) => theme.spacing.md} ${({ theme }) => theme.spacing.lg};
  background: linear-gradient(145deg, ${({ theme }) => theme.colors.secondary[300]}, ${({ theme }) => theme.colors.secondary[500]});
  color: ${({ theme }) => theme.colors.onAccent};
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
  cursor: pointer;

  &:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 6px 18px rgba(220, 185, 79, 0.25);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;
