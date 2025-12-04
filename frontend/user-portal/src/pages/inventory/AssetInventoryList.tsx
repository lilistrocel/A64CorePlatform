/**
 * Asset Inventory List
 *
 * Displays and manages farm assets inventory (tractors, machinery, infrastructure)
 */

import { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import {
  listAssetInventory,
  createAssetInventory,
  updateAssetInventory,
  deleteAssetInventory,
} from '../../services/inventoryApi';
import { getFarms } from '../../services/farmApi';
import type {
  AssetInventory,
  AssetInventoryCreate,
  AssetInventoryUpdate,
  AssetCategory,
  AssetStatus,
} from '../../types/inventory';
import { ASSET_CATEGORY_LABELS, ASSET_STATUS_LABELS } from '../../types/inventory';
import type { Farm } from '../../types/farm';

interface AssetInventoryListProps {
  onUpdate?: () => void;
}

export function AssetInventoryList({ onUpdate }: AssetInventoryListProps) {
  const [assets, setAssets] = useState<AssetInventory[]>([]);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<AssetCategory | ''>('');
  const [statusFilter, setStatusFilter] = useState<AssetStatus | ''>('');
  const [maintenanceOverdue, setMaintenanceOverdue] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<AssetInventory | null>(null);

  const loadAssets = useCallback(async () => {
    try {
      setLoading(true);
      const response = await listAssetInventory({
        category: categoryFilter || undefined,
        status: statusFilter || undefined,
        maintenanceOverdue: maintenanceOverdue || undefined,
        search: search || undefined,
        page,
        perPage: 20,
      });
      setAssets(response.items);
      setTotalPages(response.totalPages);
    } catch (error) {
      console.error('Failed to load asset inventory:', error);
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, statusFilter, maintenanceOverdue, search, page]);

  const loadFarms = async () => {
    try {
      const response = await getFarms(1, 100);
      setFarms(response.items || []);
    } catch (error) {
      console.error('Failed to load farms:', error);
    }
  };

  useEffect(() => {
    loadAssets();
  }, [loadAssets]);

  useEffect(() => {
    loadFarms();
  }, []);

  const handleAdd = async (data: AssetInventoryCreate) => {
    try {
      await createAssetInventory(data);
      setShowAddModal(false);
      loadAssets();
      onUpdate?.();
    } catch (error) {
      console.error('Failed to add asset:', error);
      throw error;
    }
  };

  const handleEdit = async (data: AssetInventoryUpdate) => {
    if (!selectedAsset) return;
    try {
      await updateAssetInventory(selectedAsset.inventoryId, data);
      setShowEditModal(false);
      setSelectedAsset(null);
      loadAssets();
      onUpdate?.();
    } catch (error) {
      console.error('Failed to update asset:', error);
      throw error;
    }
  };

  const handleDelete = async (asset: AssetInventory) => {
    if (!window.confirm(`Are you sure you want to delete "${asset.assetName}"?`)) {
      return;
    }
    try {
      await deleteAssetInventory(asset.inventoryId);
      loadAssets();
      onUpdate?.();
    } catch (error) {
      console.error('Failed to delete asset:', error);
    }
  };

  const getStatusColor = (status: AssetStatus) => {
    switch (status) {
      case 'operational':
        return 'success';
      case 'maintenance':
        return 'warning';
      case 'repair':
        return 'error';
      case 'decommissioned':
        return 'neutral';
      case 'stored':
        return 'info';
      default:
        return 'neutral';
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString();
  };

  const formatCurrency = (value?: number, currency?: string) => {
    if (value === undefined || value === null) return '-';
    return `${currency || 'AED'} ${value.toLocaleString()}`;
  };

  return (
    <Container>
      {/* Filters */}
      <FiltersRow>
        <SearchInput
          type="text"
          placeholder="Search assets..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <FilterSelect
          value={categoryFilter}
          onChange={(e) => {
            setCategoryFilter(e.target.value as AssetCategory | '');
            setPage(1);
          }}
        >
          <option value="">All Categories</option>
          {Object.entries(ASSET_CATEGORY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as AssetStatus | '');
            setPage(1);
          }}
        >
          <option value="">All Statuses</option>
          {Object.entries(ASSET_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </FilterSelect>
        <CheckboxLabel>
          <input
            type="checkbox"
            checked={maintenanceOverdue}
            onChange={(e) => {
              setMaintenanceOverdue(e.target.checked);
              setPage(1);
            }}
          />
          Maintenance Overdue
        </CheckboxLabel>
        <AddButton onClick={() => setShowAddModal(true)}>+ Add Asset</AddButton>
      </FiltersRow>

      {/* Table */}
      {loading ? (
        <LoadingState>Loading...</LoadingState>
      ) : assets.length === 0 ? (
        <EmptyState>
          <EmptyIcon>🚜</EmptyIcon>
          <EmptyTitle>No assets found</EmptyTitle>
          <EmptyText>Add your first farm asset to start tracking.</EmptyText>
        </EmptyState>
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Asset</Th>
                <Th>Category</Th>
                <Th>Status</Th>
                <Th>Location</Th>
                <Th>Value</Th>
                <Th>Next Maintenance</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {assets.map((asset) => (
                <Tr key={asset.inventoryId}>
                  <Td>
                    <AssetInfo>
                      <AssetName>{asset.assetName}</AssetName>
                      {asset.brand && asset.model && (
                        <AssetMeta>
                          {asset.brand} {asset.model}
                          {asset.year && ` (${asset.year})`}
                        </AssetMeta>
                      )}
                      {asset.assetTag && <AssetTag>#{asset.assetTag}</AssetTag>}
                    </AssetInfo>
                  </Td>
                  <Td>
                    <CategoryBadge>{ASSET_CATEGORY_LABELS[asset.category]}</CategoryBadge>
                  </Td>
                  <Td>
                    <StatusBadge $status={getStatusColor(asset.status)}>
                      {ASSET_STATUS_LABELS[asset.status]}
                    </StatusBadge>
                  </Td>
                  <Td>{asset.location || '-'}</Td>
                  <Td>{formatCurrency(asset.currentValue, asset.currency)}</Td>
                  <Td>
                    {asset.maintenanceOverdue ? (
                      <OverdueDate>{formatDate(asset.nextMaintenanceDate)}</OverdueDate>
                    ) : (
                      formatDate(asset.nextMaintenanceDate)
                    )}
                  </Td>
                  <Td>
                    <Actions>
                      <ActionButton
                        onClick={() => {
                          setSelectedAsset(asset);
                          setShowEditModal(true);
                        }}
                      >
                        Edit
                      </ActionButton>
                      <ActionButton $danger onClick={() => handleDelete(asset)}>
                        Delete
                      </ActionButton>
                    </Actions>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>

          {/* Pagination */}
          {totalPages > 1 && (
            <Pagination>
              <PageButton disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </PageButton>
              <PageInfo>
                Page {page} of {totalPages}
              </PageInfo>
              <PageButton disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>
                Next
              </PageButton>
            </Pagination>
          )}
        </>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <AddAssetModal
          farms={farms}
          onClose={() => setShowAddModal(false)}
          onSubmit={handleAdd}
        />
      )}

      {/* Edit Modal */}
      {showEditModal && selectedAsset && (
        <EditAssetModal
          asset={selectedAsset}
          onClose={() => {
            setShowEditModal(false);
            setSelectedAsset(null);
          }}
          onSubmit={handleEdit}
        />
      )}
    </Container>
  );
}

// ============================================================================
// ADD ASSET MODAL
// ============================================================================

interface AddAssetModalProps {
  farms: Farm[];
  onClose: () => void;
  onSubmit: (data: AssetInventoryCreate) => Promise<void>;
}

function AddAssetModal({ farms, onClose, onSubmit }: AddAssetModalProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<Partial<AssetInventoryCreate>>({
    status: 'operational',
    currency: 'AED',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.farmId || !formData.assetName || !formData.category) {
      alert('Please fill in all required fields');
      return;
    }
    try {
      setLoading(true);
      await onSubmit(formData as AssetInventoryCreate);
    } catch {
      alert('Failed to add asset');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalOverlay onClick={onClose}>
      <ModalContent onClick={(e) => e.stopPropagation()}>
        <ModalHeader>
          <ModalTitle>Add Farm Asset</ModalTitle>
          <CloseButton onClick={onClose}>&times;</CloseButton>
        </ModalHeader>
        <ModalForm onSubmit={handleSubmit}>
          <FormSection>
            <SectionTitle>Basic Information</SectionTitle>
            <FormRow>
              <FormGroup>
                <Label>
                  Farm <Required>*</Required>
                </Label>
                <Select
                  required
                  value={formData.farmId || ''}
                  onChange={(e) => setFormData({ ...formData, farmId: e.target.value })}
                >
                  <option value="">Select farm</option>
                  {farms.map((farm) => (
                    <option key={farm.farmId} value={farm.farmId}>
                      {farm.name}
                    </option>
                  ))}
                </Select>
              </FormGroup>
              <FormGroup>
                <Label>
                  Asset Name <Required>*</Required>
                </Label>
                <Input
                  required
                  value={formData.assetName || ''}
                  onChange={(e) => setFormData({ ...formData, assetName: e.target.value })}
                  placeholder="e.g., John Deere Tractor"
                />
              </FormGroup>
            </FormRow>
            <FormRow>
              <FormGroup>
                <Label>
                  Category <Required>*</Required>
                </Label>
                <Select
                  required
                  value={formData.category || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, category: e.target.value as AssetCategory })
                  }
                >
                  <option value="">Select category</option>
                  {Object.entries(ASSET_CATEGORY_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </FormGroup>
              <FormGroup>
                <Label>Status</Label>
                <Select
                  value={formData.status || 'operational'}
                  onChange={(e) =>
                    setFormData({ ...formData, status: e.target.value as AssetStatus })
                  }
                >
                  {Object.entries(ASSET_STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </FormGroup>
            </FormRow>
          </FormSection>

          <FormSection>
            <SectionTitle>Details</SectionTitle>
            <FormRow>
              <FormGroup>
                <Label>Brand</Label>
                <Input
                  value={formData.brand || ''}
                  onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                  placeholder="e.g., John Deere"
                />
              </FormGroup>
              <FormGroup>
                <Label>Model</Label>
                <Input
                  value={formData.model || ''}
                  onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                  placeholder="e.g., 6M Series"
                />
              </FormGroup>
            </FormRow>
            <FormRow>
              <FormGroup>
                <Label>Year</Label>
                <Input
                  type="number"
                  value={formData.year || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, year: parseInt(e.target.value) || undefined })
                  }
                  placeholder="e.g., 2020"
                />
              </FormGroup>
              <FormGroup>
                <Label>Serial Number</Label>
                <Input
                  value={formData.serialNumber || ''}
                  onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
                  placeholder="e.g., SN123456"
                />
              </FormGroup>
            </FormRow>
            <FormRow>
              <FormGroup>
                <Label>Asset Tag</Label>
                <Input
                  value={formData.assetTag || ''}
                  onChange={(e) => setFormData({ ...formData, assetTag: e.target.value })}
                  placeholder="e.g., ASSET-001"
                />
              </FormGroup>
              <FormGroup>
                <Label>Condition</Label>
                <Input
                  value={formData.condition || ''}
                  onChange={(e) => setFormData({ ...formData, condition: e.target.value })}
                  placeholder="e.g., Excellent"
                />
              </FormGroup>
            </FormRow>
          </FormSection>

          <FormSection>
            <SectionTitle>Location & Assignment</SectionTitle>
            <FormRow>
              <FormGroup>
                <Label>Location</Label>
                <Input
                  value={formData.location || ''}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  placeholder="e.g., Main Barn"
                />
              </FormGroup>
              <FormGroup>
                <Label>Assigned To</Label>
                <Input
                  value={formData.assignedTo || ''}
                  onChange={(e) => setFormData({ ...formData, assignedTo: e.target.value })}
                  placeholder="e.g., John Smith"
                />
              </FormGroup>
            </FormRow>
          </FormSection>

          <FormSection>
            <SectionTitle>Financial</SectionTitle>
            <FormRow>
              <FormGroup>
                <Label>Purchase Date</Label>
                <Input
                  type="date"
                  value={formData.purchaseDate || ''}
                  onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })}
                />
              </FormGroup>
              <FormGroup>
                <Label>Purchase Price</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.purchasePrice || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      purchasePrice: parseFloat(e.target.value) || undefined,
                    })
                  }
                  placeholder="0.00"
                />
              </FormGroup>
            </FormRow>
            <FormRow>
              <FormGroup>
                <Label>Current Value</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.currentValue || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      currentValue: parseFloat(e.target.value) || undefined,
                    })
                  }
                  placeholder="0.00"
                />
              </FormGroup>
              <FormGroup>
                <Label>Currency</Label>
                <Select
                  value={formData.currency || 'AED'}
                  onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                >
                  <option value="AED">AED</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </Select>
              </FormGroup>
            </FormRow>
          </FormSection>

          <FormSection>
            <SectionTitle>Maintenance</SectionTitle>
            <FormRow>
              <FormGroup>
                <Label>Last Maintenance</Label>
                <Input
                  type="date"
                  value={formData.lastMaintenanceDate || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, lastMaintenanceDate: e.target.value })
                  }
                />
              </FormGroup>
              <FormGroup>
                <Label>Next Maintenance</Label>
                <Input
                  type="date"
                  value={formData.nextMaintenanceDate || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, nextMaintenanceDate: e.target.value })
                  }
                />
              </FormGroup>
            </FormRow>
            <FormGroup>
              <Label>Maintenance Notes</Label>
              <TextArea
                value={formData.maintenanceNotes || ''}
                onChange={(e) => setFormData({ ...formData, maintenanceNotes: e.target.value })}
                placeholder="Any maintenance history or notes..."
                rows={3}
              />
            </FormGroup>
          </FormSection>

          <FormSection>
            <SectionTitle>Documentation</SectionTitle>
            <FormRow>
              <FormGroup>
                <Label>Warranty Expiry</Label>
                <Input
                  type="date"
                  value={formData.warrantyExpiry || ''}
                  onChange={(e) => setFormData({ ...formData, warrantyExpiry: e.target.value })}
                />
              </FormGroup>
              <FormGroup>
                <Label>Documentation URL</Label>
                <Input
                  type="url"
                  value={formData.documentationUrl || ''}
                  onChange={(e) => setFormData({ ...formData, documentationUrl: e.target.value })}
                  placeholder="https://..."
                />
              </FormGroup>
            </FormRow>
            <FormGroup>
              <Label>Specifications</Label>
              <TextArea
                value={formData.specifications || ''}
                onChange={(e) => setFormData({ ...formData, specifications: e.target.value })}
                placeholder="Technical specifications..."
                rows={3}
              />
            </FormGroup>
          </FormSection>

          <FormSection>
            <FormGroup>
              <Label>Notes</Label>
              <TextArea
                value={formData.notes || ''}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Additional notes..."
                rows={3}
              />
            </FormGroup>
          </FormSection>

          <ModalFooter>
            <CancelButton type="button" onClick={onClose}>
              Cancel
            </CancelButton>
            <SubmitButton type="submit" disabled={loading}>
              {loading ? 'Adding...' : 'Add Asset'}
            </SubmitButton>
          </ModalFooter>
        </ModalForm>
      </ModalContent>
    </ModalOverlay>
  );
}

// ============================================================================
// EDIT ASSET MODAL
// ============================================================================

interface EditAssetModalProps {
  asset: AssetInventory;
  onClose: () => void;
  onSubmit: (data: AssetInventoryUpdate) => Promise<void>;
}

function EditAssetModal({ asset, onClose, onSubmit }: EditAssetModalProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<AssetInventoryUpdate>({
    assetName: asset.assetName,
    status: asset.status,
    condition: asset.condition || '',
    location: asset.location || '',
    assignedTo: asset.assignedTo || '',
    currentValue: asset.currentValue,
    lastMaintenanceDate: asset.lastMaintenanceDate || '',
    nextMaintenanceDate: asset.nextMaintenanceDate || '',
    maintenanceNotes: asset.maintenanceNotes || '',
    notes: asset.notes || '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      await onSubmit(formData);
    } catch {
      alert('Failed to update asset');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalOverlay onClick={onClose}>
      <ModalContent onClick={(e) => e.stopPropagation()}>
        <ModalHeader>
          <ModalTitle>Edit Asset</ModalTitle>
          <CloseButton onClick={onClose}>&times;</CloseButton>
        </ModalHeader>
        <ModalForm onSubmit={handleSubmit}>
          <FormSection>
            <SectionTitle>Basic Information</SectionTitle>
            <FormRow>
              <FormGroup>
                <Label>Asset Name</Label>
                <Input
                  value={formData.assetName || ''}
                  onChange={(e) => setFormData({ ...formData, assetName: e.target.value })}
                />
              </FormGroup>
              <FormGroup>
                <Label>Status</Label>
                <Select
                  value={formData.status || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, status: e.target.value as AssetStatus })
                  }
                >
                  {Object.entries(ASSET_STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </FormGroup>
            </FormRow>
            <FormRow>
              <FormGroup>
                <Label>Condition</Label>
                <Input
                  value={formData.condition || ''}
                  onChange={(e) => setFormData({ ...formData, condition: e.target.value })}
                  placeholder="e.g., Excellent, Good, Fair"
                />
              </FormGroup>
              <FormGroup>
                <Label>Location</Label>
                <Input
                  value={formData.location || ''}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                />
              </FormGroup>
            </FormRow>
            <FormGroup>
              <Label>Assigned To</Label>
              <Input
                value={formData.assignedTo || ''}
                onChange={(e) => setFormData({ ...formData, assignedTo: e.target.value })}
              />
            </FormGroup>
          </FormSection>

          <FormSection>
            <SectionTitle>Financial</SectionTitle>
            <FormGroup>
              <Label>Current Value</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.currentValue || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    currentValue: parseFloat(e.target.value) || undefined,
                  })
                }
              />
            </FormGroup>
          </FormSection>

          <FormSection>
            <SectionTitle>Maintenance</SectionTitle>
            <FormRow>
              <FormGroup>
                <Label>Last Maintenance</Label>
                <Input
                  type="date"
                  value={formData.lastMaintenanceDate || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, lastMaintenanceDate: e.target.value })
                  }
                />
              </FormGroup>
              <FormGroup>
                <Label>Next Maintenance</Label>
                <Input
                  type="date"
                  value={formData.nextMaintenanceDate || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, nextMaintenanceDate: e.target.value })
                  }
                />
              </FormGroup>
            </FormRow>
            <FormGroup>
              <Label>Maintenance Notes</Label>
              <TextArea
                value={formData.maintenanceNotes || ''}
                onChange={(e) => setFormData({ ...formData, maintenanceNotes: e.target.value })}
                rows={3}
              />
            </FormGroup>
          </FormSection>

          <FormSection>
            <FormGroup>
              <Label>Notes</Label>
              <TextArea
                value={formData.notes || ''}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
              />
            </FormGroup>
          </FormSection>

          <ModalFooter>
            <CancelButton type="button" onClick={onClose}>
              Cancel
            </CancelButton>
            <SubmitButton type="submit" disabled={loading}>
              {loading ? 'Saving...' : 'Save Changes'}
            </SubmitButton>
          </ModalFooter>
        </ModalForm>
      </ModalContent>
    </ModalOverlay>
  );
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Container = styled.div``;

const FiltersRow = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
  flex-wrap: wrap;
  align-items: center;
`;

const SearchInput = styled.input`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  min-width: 200px;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary[500]};
  }
`;

const FilterSelect = styled.select`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  background: ${({ theme }) => theme.colors.surface};
  cursor: pointer;

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

  input {
    cursor: pointer;
  }
`;

const AddButton = styled.button`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.lg};
  background: ${({ theme }) => theme.colors.primary[500]};
  color: white;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  cursor: pointer;
  margin-left: auto;

  &:hover {
    background: ${({ theme }) => theme.colors.primary[600]};
  }
`;

const LoadingState = styled.div`
  text-align: center;
  padding: ${({ theme }) => theme.spacing['2xl']};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const EmptyState = styled.div`
  text-align: center;
  padding: ${({ theme }) => theme.spacing['3xl']};
`;

const EmptyIcon = styled.div`
  font-size: 4rem;
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const EmptyTitle = styled.h3`
  font-size: ${({ theme }) => theme.typography.fontSize.lg};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 ${({ theme }) => theme.spacing.xs} 0;
`;

const EmptyText = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0;
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
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textSecondary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[200]};
`;

const Tr = styled.tr`
  &:hover {
    background: ${({ theme }) => theme.colors.neutral[50]};
  }
`;

const Td = styled.td`
  padding: ${({ theme }) => theme.spacing.md};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textPrimary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[100]};
`;

const AssetInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const AssetName = styled.div`
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
`;

const AssetMeta = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const AssetTag = styled.span`
  display: inline-block;
  padding: 2px ${({ theme }) => theme.spacing.xs};
  background: ${({ theme }) => theme.colors.neutral[100]};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const CategoryBadge = styled.span`
  display: inline-block;
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  background: ${({ theme }) => theme.colors.neutral[100]};
  border-radius: ${({ theme }) => theme.borderRadius.full};
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

interface StatusBadgeProps {
  $status: 'success' | 'warning' | 'error' | 'neutral' | 'info';
}

const StatusBadge = styled.span<StatusBadgeProps>`
  display: inline-block;
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  border-radius: ${({ theme }) => theme.borderRadius.full};
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  background: ${({ theme, $status }) => {
    switch ($status) {
      case 'success':
        return theme.colors.success + '20';
      case 'warning':
        return theme.colors.warning + '20';
      case 'error':
        return theme.colors.error + '20';
      case 'info':
        return theme.colors.primary[100];
      default:
        return theme.colors.neutral[100];
    }
  }};
  color: ${({ theme, $status }) => {
    switch ($status) {
      case 'success':
        return theme.colors.success;
      case 'warning':
        return theme.colors.warning;
      case 'error':
        return theme.colors.error;
      case 'info':
        return theme.colors.primary[600];
      default:
        return theme.colors.textSecondary;
    }
  }};
`;

const OverdueDate = styled.span`
  color: ${({ theme }) => theme.colors.error};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
`;

const Actions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
`;

interface ActionButtonProps {
  $danger?: boolean;
}

const ActionButton = styled.button<ActionButtonProps>`
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  background: transparent;
  border: 1px solid
    ${({ theme, $danger }) => ($danger ? theme.colors.error : theme.colors.neutral[300])};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  color: ${({ theme, $danger }) => ($danger ? theme.colors.error : theme.colors.textSecondary)};
  cursor: pointer;

  &:hover {
    background: ${({ theme, $danger }) => ($danger ? theme.colors.error + '10' : theme.colors.neutral[100])};
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
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textPrimary};
  cursor: pointer;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.neutral[100]};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const PageInfo = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

// Modal Styles
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
  background: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  width: 90%;
  max-width: 700px;
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
  font-size: ${({ theme }) => theme.typography.fontSize.lg};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  font-size: 1.5rem;
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer;
  padding: 0;
  line-height: 1;

  &:hover {
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

const ModalForm = styled.form`
  padding: ${({ theme }) => theme.spacing.lg};
`;

const FormSection = styled.div`
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const SectionTitle = styled.h3`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0 0 ${({ theme }) => theme.spacing.md} 0;
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const FormRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: ${({ theme }) => theme.spacing.md};

  @media (max-width: 600px) {
    grid-template-columns: 1fr;
  }
`;

const FormGroup = styled.div`
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const Label = styled.label`
  display: block;
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin-bottom: ${({ theme }) => theme.spacing.xs};
`;

const Required = styled.span`
  color: ${({ theme }) => theme.colors.error};
`;

const Input = styled.input`
  width: 100%;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
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
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
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
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
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

const ModalFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.spacing.md};
  padding-top: ${({ theme }) => theme.spacing.lg};
  border-top: 1px solid ${({ theme }) => theme.colors.neutral[200]};
`;

const CancelButton = styled.button`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.lg};
  background: ${({ theme }) => theme.colors.neutral[100]};
  color: ${({ theme }) => theme.colors.textPrimary};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  cursor: pointer;

  &:hover {
    background: ${({ theme }) => theme.colors.neutral[200]};
  }
`;

const SubmitButton = styled.button`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.lg};
  background: ${({ theme }) => theme.colors.primary[500]};
  color: white;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  cursor: pointer;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.primary[600]};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;
