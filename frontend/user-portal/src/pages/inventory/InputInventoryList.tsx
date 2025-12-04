/**
 * Input Inventory List
 *
 * Lists and manages input materials (fertilizers, pesticides, seeds, etc.)
 */

import { useState, useEffect } from 'react';
import styled from 'styled-components';
import {
  listInputInventory,
  createInputInventory,
  updateInputInventory,
  deleteInputInventory,
  useInputInventory,
} from '../../services/inventoryApi';
import { getFarms } from '../../services/farmApi';
import type {
  InputInventory,
  InputInventoryCreate,
  InputCategory,
  PaginatedResponse,
} from '../../types/inventory';
import type { Farm } from '../../types/farm';
import { INPUT_CATEGORY_LABELS } from '../../types/inventory';

interface Props {
  onUpdate?: () => void;
}

export function InputInventoryList({ onUpdate }: Props) {
  const [inventory, setInventory] = useState<InputInventory[]>([]);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
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

  const isExpiringSoon = (expiryDate?: string) => {
    if (!expiryDate) return false;
    const expiry = new Date(expiryDate);
    const now = new Date();
    const daysUntilExpiry = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntilExpiry <= 30 && daysUntilExpiry > 0;
  };

  return (
    <Container>
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
        <AddButton onClick={() => setShowAddModal(true)}>+ Add Input</AddButton>
      </Toolbar>

      {loading ? (
        <LoadingMessage>Loading inventory...</LoadingMessage>
      ) : inventory.length === 0 ? (
        <EmptyMessage>
          <EmptyIcon>🧪</EmptyIcon>
          <EmptyText>No input inventory items found</EmptyText>
          <EmptySubtext>Add fertilizers, seeds, and other inputs</EmptySubtext>
        </EmptyMessage>
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Item</Th>
                <Th>Category</Th>
                <Th>Farm</Th>
                <Th>Quantity</Th>
                <Th>Status</Th>
                <Th>Supplier</Th>
                <Th>Expiry</Th>
                <Th>Actions</Th>
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
                      <QuantityValue>{item.quantity} {item.unit}</QuantityValue>
                      <MinStock>Min: {item.minimumStock} {item.unit}</MinStock>
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
                      <ExpiryDate $expiringSoon={isExpiringSoon(item.expiryDate)}>
                        {formatDate(item.expiryDate)}
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
  const [formData, setFormData] = useState<Partial<InputInventoryCreate>>({
    category: 'fertilizer',
    currency: 'AED',
    minimumStock: 0,
  });

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
    <ModalOverlay onClick={onClose}>
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
                  onChange={(e) => setFormData({ ...formData, category: e.target.value as InputCategory })}
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
                <Input
                  type="text"
                  placeholder="kg, L, units"
                  value={formData.unit || ''}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  required
                />
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
                <Label>Storage Location</Label>
                <Input
                  type="text"
                  placeholder="e.g., Warehouse B"
                  value={formData.storageLocation || ''}
                  onChange={(e) => setFormData({ ...formData, storageLocation: e.target.value })}
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
    <ModalOverlay onClick={onClose}>
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
    <ModalOverlay onClick={onClose}>
      <ModalContent onClick={(e) => e.stopPropagation()}>
        <ModalHeader>
          <ModalTitle>Use: {item.itemName}</ModalTitle>
          <CloseButton onClick={onClose}>&times;</CloseButton>
        </ModalHeader>
        <ModalBody>
          <CurrentStock>
            Available: <strong>{item.quantity} {item.unit}</strong>
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
  max-width: 300px;
  padding: ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSize.base};

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary[500]};
  }
`;

const FilterGroup = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
`;

const Select = styled.select`
  padding: ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  background-color: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.textPrimary};
  min-width: 150px;

  option {
    background-color: ${({ theme }) => theme.colors.background};
    color: ${({ theme }) => theme.colors.textPrimary};
  }

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary[500]};
  }
`;

const CheckboxLabel = styled.label`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer;
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

const ItemInfo = styled.div``;

const ItemName = styled.div`
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const ItemBrand = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const ItemSku = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const CategoryBadge = styled.span`
  display: inline-block;
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  background: ${({ theme }) => theme.colors.primary[100]};
  color: ${({ theme }) => theme.colors.primary[700]};
`;

const QuantityInfo = styled.div``;

const QuantityValue = styled.div`
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
`;

const MinStock = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

interface StatusBadgeProps {
  $status: 'ok' | 'low';
}

const StatusBadge = styled.span<StatusBadgeProps>`
  display: inline-block;
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  background: ${({ theme, $status }) =>
    $status === 'low' ? theme.colors.error + '20' : theme.colors.success + '20'};
  color: ${({ theme, $status }) =>
    $status === 'low' ? theme.colors.error : theme.colors.success};
`;

interface ExpiryDateProps {
  $expiringSoon: boolean;
}

const ExpiryDate = styled.span<ExpiryDateProps>`
  color: ${({ theme, $expiringSoon }) =>
    $expiringSoon ? theme.colors.warning : 'inherit'};
  font-weight: ${({ $expiringSoon }) => ($expiringSoon ? '500' : 'normal')};
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

const CurrentStock = styled.div`
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.neutral[100]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
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
