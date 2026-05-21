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
  exportAssetInventoryCSV,
} from '../../services/inventoryApi';
import { getFarms } from '../../services/farmApi';
import { formatCurrency as formatCurrencyUtil } from '../../utils';
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
    return formatCurrencyUtil(value, currency || 'AED');
  };

  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    try {
      setExporting(true);
      await exportAssetInventoryCSV({
        search,
        category: categoryFilter || undefined,
        status: statusFilter || undefined,
        maintenanceOverdue: maintenanceOverdue || undefined,
      });
    } catch (error) {
      console.error('Failed to export:', error);
      alert('Failed to export inventory');
    } finally {
      setExporting(false);
    }
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
        <ToolbarButtons>
          <ExportButton onClick={handleExport} disabled={exporting}>
            {exporting ? 'Exporting...' : '📥 Export CSV'}
          </ExportButton>
          <AddButton onClick={() => setShowAddModal(true)}>+ Add Asset</AddButton>
        </ToolbarButtons>
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
          <Table aria-label="Asset inventory table">
            <thead>
              <tr>
                <Th scope="col">Asset</Th>
                <Th scope="col">Category</Th>
                <Th scope="col">Status</Th>
                <Th scope="col">Location</Th>
                <Th scope="col">Value</Th>
                <Th scope="col">Next Maintenance</Th>
                <Th scope="col">Actions</Th>
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
    <ModalOverlay>
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
    <ModalOverlay>
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
  gap: ${({ theme }) => theme.space['4']};
  margin-bottom: ${({ theme }) => theme.space['6']};
  flex-wrap: wrap;
  align-items: center;
`;

const SearchInput = styled.input`
  padding: ${({ theme }) => theme.space['2']} ${({ theme }) => theme.space['4']};
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
  min-width: 200px;
  background: ${({ theme }) => theme.colors.surface.canvas};
  color: ${({ theme }) => theme.colors.text.primary};

  &::placeholder {
    color: ${({ theme }) => theme.colors.text.tertiary};
  }

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.accent.sage};
  }
`;

const FilterSelect = styled.select`
  padding: ${({ theme }) => theme.space['2']} ${({ theme }) => theme.space['4']};
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
  background: ${({ theme }) => theme.colors.surface.raised};
  color: ${({ theme }) => theme.colors.text.primary};
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.accent.sage};
  }
`;

const CheckboxLabel = styled.label`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space['1']};
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
  color: ${({ theme }) => theme.colors.text.secondary};
  cursor: pointer;

  input {
    cursor: pointer;
  }
`;

const ToolbarButtons = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space['2']};
  align-items: center;
  margin-left: auto;
`;

const ExportButton = styled.button`
  padding: ${({ theme }) => theme.space['2']} ${({ theme }) => theme.space['6']};
  background: ${({ theme }) => theme.colors.surface.raised};
  color: ${({ theme }) => theme.colors.text.primary};
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  cursor: pointer;
  transition: all 0.2s;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.surface.sunken};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const AddButton = styled.button`
  padding: ${({ theme }) => theme.space['2']} ${({ theme }) => theme.space['6']};
  background: ${({ theme }) => theme.colors.accent.sage};
  color: white;
  border: none;
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  cursor: pointer;

  &:hover {
    background: ${({ theme }) => theme.colors.accent.sageDeep};
  }
`;

const LoadingState = styled.div`
  text-align: center;
  padding: ${({ theme }) => theme.space['12']};
  color: ${({ theme }) => theme.colors.text.secondary};
`;

const EmptyState = styled.div`
  text-align: center;
  padding: ${({ theme }) => theme.space['16']};
`;

const EmptyIcon = styled.div`
  font-size: 4rem;
  margin-bottom: ${({ theme }) => theme.space['4']};
`;

const EmptyTitle = styled.h3`
  font-size: ${({ theme }) => theme.fontSizes.bodyLg};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text.primary};
  margin: 0 0 ${({ theme }) => theme.space['1']} 0;
`;

const EmptyText = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
  color: ${({ theme }) => theme.colors.text.secondary};
  margin: 0;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  background: ${({ theme }) => theme.colors.surface.raised};
  border-radius: ${({ theme }) => theme.radii.lg};
  overflow: hidden;
  box-shadow: ${({ theme }) => theme.shadows.sm};
`;

const Th = styled.th`
  text-align: left;
  padding: ${({ theme }) => theme.space['4']};
  background: ${({ theme }) => theme.colors.surface.raised};
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text.secondary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.surface.sunken};
`;

const Tr = styled.tr`
  &:hover {
    background: ${({ theme }) => theme.colors.surface.canvas};
  }
`;

const Td = styled.td`
  padding: ${({ theme }) => theme.space['4']};
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
  color: ${({ theme }) => theme.colors.text.primary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.surface.raised};
`;

const AssetInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space['1']};
`;

const AssetName = styled.div`
  font-weight: ${({ theme }) => theme.fontWeights.medium};
`;

const AssetMeta = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.caption};
  color: ${({ theme }) => theme.colors.text.secondary};
`;

const AssetTag = styled.span`
  display: inline-block;
  padding: 2px ${({ theme }) => theme.space['1']};
  background: ${({ theme }) => theme.colors.surface.raised};
  border-radius: ${({ theme }) => theme.radii.sm};
  font-size: ${({ theme }) => theme.fontSizes.caption};
  color: ${({ theme }) => theme.colors.text.secondary};
`;

const CategoryBadge = styled.span`
  display: inline-block;
  padding: ${({ theme }) => theme.space['1']} ${({ theme }) => theme.space['2']};
  background: ${({ theme }) => theme.colors.surface.raised};
  border-radius: ${({ theme }) => theme.radii.pill};
  font-size: ${({ theme }) => theme.fontSizes.caption};
  color: ${({ theme }) => theme.colors.text.secondary};
`;

interface StatusBadgeProps {
  $status: 'success' | 'warning' | 'error' | 'neutral' | 'info';
}

const StatusBadge = styled.span<StatusBadgeProps>`
  display: inline-block;
  padding: ${({ theme }) => theme.space['1']} ${({ theme }) => theme.space['2']};
  border-radius: ${({ theme }) => theme.radii.pill};
  font-size: ${({ theme }) => theme.fontSizes.caption};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  background: ${({ theme, $status }) => {
    switch ($status) {
      case 'success':
        return theme.colors.status.success + '20';
      case 'warning':
        return theme.colors.status.warning + '20';
      case 'error':
        return theme.colors.status.danger + '20';
      case 'info':
        return theme.colors.accent.sageSoft;
      default:
        return theme.colors.surface.raised;
    }
  }};
  color: ${({ theme, $status }) => {
    switch ($status) {
      case 'success':
        return theme.colors.status.success;
      case 'warning':
        return theme.colors.status.warning;
      case 'error':
        return theme.colors.status.danger;
      case 'info':
        return theme.colors.accent.sageDeep;
      default:
        return theme.colors.text.secondary;
    }
  }};
`;

const OverdueDate = styled.span`
  color: ${({ theme }) => theme.colors.status.danger};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
`;

const Actions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space['2']};
`;

interface ActionButtonProps {
  $danger?: boolean;
}

const ActionButton = styled.button<ActionButtonProps>`
  padding: ${({ theme }) => theme.space['1']} ${({ theme }) => theme.space['2']};
  background: transparent;
  border: 1px solid
    ${({ theme, $danger }) => ($danger ? theme.colors.status.danger : theme.colors.border.subtle)};
  border-radius: ${({ theme }) => theme.radii.sm};
  font-size: ${({ theme }) => theme.fontSizes.caption};
  color: ${({ theme, $danger }) => ($danger ? theme.colors.status.danger : theme.colors.text.secondary)};
  cursor: pointer;

  &:hover {
    background: ${({ theme, $danger }) => ($danger ? theme.colors.status.danger + '10' : theme.colors.surface.raised)};
  }
`;

const Pagination = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  gap: ${({ theme }) => theme.space['4']};
  margin-top: ${({ theme }) => theme.space['6']};
`;

const PageButton = styled.button`
  padding: ${({ theme }) => theme.space['2']} ${({ theme }) => theme.space['4']};
  background: ${({ theme }) => theme.colors.surface.raised};
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
  color: ${({ theme }) => theme.colors.text.primary};
  cursor: pointer;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.surface.raised};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const PageInfo = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
  color: ${({ theme }) => theme.colors.text.secondary};
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
  background: ${({ theme }) => theme.colors.surface.raised};
  border-radius: ${({ theme }) => theme.radii.lg};
  width: 90%;
  max-width: 700px;
  max-height: 90vh;
  overflow-y: auto;
`;

const ModalHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: ${({ theme }) => theme.space['6']};
  border-bottom: 1px solid ${({ theme }) => theme.colors.surface.sunken};
`;

const ModalTitle = styled.h2`
  font-size: ${({ theme }) => theme.fontSizes.bodyLg};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text.primary};
  margin: 0;
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  font-size: 1.5rem;
  color: ${({ theme }) => theme.colors.text.secondary};
  cursor: pointer;
  padding: 0;
  line-height: 1;

  &:hover {
    color: ${({ theme }) => theme.colors.text.primary};
  }
`;

const ModalForm = styled.form`
  padding: ${({ theme }) => theme.space['6']};
`;

const FormSection = styled.div`
  margin-bottom: ${({ theme }) => theme.space['6']};
`;

const SectionTitle = styled.h3`
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text.secondary};
  margin: 0 0 ${({ theme }) => theme.space['4']} 0;
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const FormRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: ${({ theme }) => theme.space['4']};

  @media (max-width: 600px) {
    grid-template-columns: 1fr;
  }
`;

const FormGroup = styled.div`
  margin-bottom: ${({ theme }) => theme.space['4']};
`;

const Label = styled.label`
  display: block;
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.text.primary};
  margin-bottom: ${({ theme }) => theme.space['1']};
`;

const Required = styled.span`
  color: ${({ theme }) => theme.colors.status.danger};
`;

const Input = styled.input`
  width: 100%;
  padding: ${({ theme }) => theme.space['2']} ${({ theme }) => theme.space['4']};
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
  background-color: ${({ theme }) => theme.colors.surface.canvas};
  color: ${({ theme }) => theme.colors.text.primary};

  &::placeholder {
    color: ${({ theme }) => theme.colors.text.secondary};
    opacity: 1;
  }

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.accent.sage};
  }
`;

const Select = styled.select`
  width: 100%;
  padding: ${({ theme }) => theme.space['2']} ${({ theme }) => theme.space['4']};
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
  background-color: ${({ theme }) => theme.colors.surface.canvas};
  color: ${({ theme }) => theme.colors.text.primary};

  option {
    background-color: ${({ theme }) => theme.colors.surface.canvas};
    color: ${({ theme }) => theme.colors.text.primary};
  }

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.accent.sage};
  }
`;

const TextArea = styled.textarea`
  width: 100%;
  padding: ${({ theme }) => theme.space['2']} ${({ theme }) => theme.space['4']};
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
  background-color: ${({ theme }) => theme.colors.surface.canvas};
  color: ${({ theme }) => theme.colors.text.primary};
  resize: vertical;

  &::placeholder {
    color: ${({ theme }) => theme.colors.text.secondary};
    opacity: 1;
  }

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.accent.sage};
  }
`;

const ModalFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.space['4']};
  padding-top: ${({ theme }) => theme.space['6']};
  border-top: 1px solid ${({ theme }) => theme.colors.surface.sunken};
`;

const CancelButton = styled.button`
  padding: ${({ theme }) => theme.space['2']} ${({ theme }) => theme.space['6']};
  background: ${({ theme }) => theme.colors.surface.raised};
  color: ${({ theme }) => theme.colors.text.primary};
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
  cursor: pointer;

  &:hover {
    background: ${({ theme }) => theme.colors.surface.sunken};
  }
`;

const SubmitButton = styled.button`
  padding: ${({ theme }) => theme.space['2']} ${({ theme }) => theme.space['6']};
  background: ${({ theme }) => theme.colors.accent.sage};
  color: white;
  border: none;
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  cursor: pointer;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.accent.sageDeep};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;
