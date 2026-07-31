/**
 * Asset Inventory List
 *
 * Displays and manages farm assets inventory (tractors, machinery, infrastructure)
 */

import { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { Download, Tractor } from 'lucide-react';
import { PageHeader, glassPanel, glassControl, monoLabel, phaseBadge } from '@a64core/shared';
import type { PhaseKey } from '@a64core/shared';
import {
  listAssetInventory,
  createAssetInventory,
  updateAssetInventory,
  deleteAssetInventory,
  exportAssetInventoryCSV,
} from '../../services/inventoryApi';
import { getFarms } from '../../services/farmApi';
import { formatCurrency as formatCurrencyUtil, formatNumber } from '../../utils';
import type {
  AssetInventory,
  AssetInventoryCreate,
  AssetInventoryUpdate,
  AssetCategory,
  AssetStatus,
} from '../../types/inventory';
import { ASSET_CATEGORY_LABELS, ASSET_STATUS_LABELS } from '../../types/inventory';
import type { Farm } from '../../types/farm';

// Night Observatory (T-901): asset-status -> phase colour map (spec §5.2
// extrapolation, using the equipment-specific "maintenance" row directly
// where it applies). Internally consistent — same AssetStatus value always
// resolves to the same phase colour wherever it's rendered in this file.
const ASSET_STATUS_PHASE: Record<AssetStatus, PhaseKey> = {
  operational: 'fruiting',       // approved/posted/delivered — healthy, in service
  maintenance: 'maintenance',    // direct match: "maintenance / on hold / suspended"
  repair: 'quarantined',         // out of service, needs attention — rejected/failed analogue
  decommissioned: 'decommissioned', // direct match: "cancelled / void / archived"
  stored: 'resting',             // idle, not active — "closed / settled" analogue
};

interface AssetInventoryListProps {
  onUpdate?: () => void;
  /**
   * T-901 gold audit: InventoryDashboard renders its own PageHeader and
   * mounts this list inside its content area at `/inventory/assets`. Without
   * this flag both PageHeaders render at once — two full sets of gold stat
   * tiles/thread on one screen, well over the spec §3 gold budget. Standalone
   * callers (if any are added later) keep the header; the embedded case
   * suppresses it and relies on the parent's.
   */
  embedded?: boolean;
}

export function AssetInventoryList({ onUpdate, embedded = false }: AssetInventoryListProps) {
  const [assets, setAssets] = useState<AssetInventory[]>([]);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<AssetCategory | ''>('');
  const [statusFilter, setStatusFilter] = useState<AssetStatus | ''>('');
  const [maintenanceOverdue, setMaintenanceOverdue] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  // Night Observatory (T-901): total asset count for the PageHeader stat
  // tile — already returned by listAssetInventory(), just not previously
  // stored. No new fetch.
  const [totalAssets, setTotalAssets] = useState(0);
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
      setTotalAssets(response.total);
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

  // Night Observatory (T-901): looks up the phase colour for a status via
  // ASSET_STATUS_PHASE above instead of the old success/warning/error/neutral
  // vocabulary.
  const getStatusColor = (status: AssetStatus): PhaseKey => ASSET_STATUS_PHASE[status] ?? 'empty';

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

  const operationalOnPage = assets.filter((a) => a.status === 'operational').length;

  return (
    <Container>
      {!embedded && (
        <PageHeader
          title="Farm Assets"
          emphasizeLastWord
          description="Tractors, machinery, and infrastructure inventory"
          stats={[
            { value: loading ? '...' : formatNumber(totalAssets), label: 'Total Assets' },
            { value: loading ? '...' : formatNumber(operationalOnPage), label: 'Operational', alive: true },
          ]}
        />
      )}

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
            <Download size={14} strokeWidth={1.8} />
            {exporting ? 'Exporting...' : 'Export CSV'}
          </ExportButton>
          <AddButton onClick={() => setShowAddModal(true)}>+ Add Asset</AddButton>
        </ToolbarButtons>
      </FiltersRow>

      {/* Table */}
      {loading ? (
        <LoadingState>Loading...</LoadingState>
      ) : assets.length === 0 ? (
        <EmptyState>
          <EmptyIcon><Tractor size={48} strokeWidth={1.3} /></EmptyIcon>
          <EmptyTitle>No assets found</EmptyTitle>
          <EmptyText>Add your first farm asset to start tracking.</EmptyText>
          <EmptyAction onClick={() => setShowAddModal(true)}>+ Add Asset</EmptyAction>
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
                  <Td><MonoValue>{formatCurrency(asset.currentValue, asset.currency)}</MonoValue></Td>
                  <Td>
                    {asset.maintenanceOverdue ? (
                      <OverdueDate>{formatDate(asset.nextMaintenanceDate)}</OverdueDate>
                    ) : (
                      <MonoValue>{formatDate(asset.nextMaintenanceDate)}</MonoValue>
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

// Night Observatory (T-901): page-level container is transparent — no
// opaque background — so the fixed sky shows through (spec §2).
const Container = styled.div``;

const FiltersRow = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
  flex-wrap: wrap;
  align-items: center;
`;

const SearchInput = styled.input`
  ${glassControl}
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
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

const FilterSelect = styled.select`
  ${glassControl}
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textPrimary};
  cursor: pointer;

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

  input {
    cursor: pointer;
  }
`;

const ToolbarButtons = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
  align-items: center;
  margin-left: auto;
`;

// Secondary button (spec §4 Buttons): glass + glass.border + cream text —
// never gold; gold is reserved for the primary CTA (AddButton below).
const ExportButton = styled.button`
  ${glassControl}
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.lg};
  color: ${({ theme }) => theme.colors.onDark};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
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
// FAB/CTA" is an authorised gold element). Was background:primary[500] +
// color:white — corrected to the spec-mandated gold-gradient + onAccent
// (cosmos, dark-on-gold) treatment rather than just swapping to onDark.
const AddButton = styled.button`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.lg};
  background: linear-gradient(145deg, ${({ theme }) => theme.colors.secondary[300]}, ${({ theme }) => theme.colors.secondary[500]});
  color: ${({ theme }) => theme.colors.onAccent};
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
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

const LoadingState = styled.div`
  text-align: center;
  padding: ${({ theme }) => theme.spacing['2xl']};
  color: ${({ theme }) => theme.colors.muted};
`;

const EmptyState = styled.div`
  text-align: center;
  padding: ${({ theme }) => theme.spacing['3xl']};
`;

const EmptyIcon = styled.div`
  display: flex;
  justify-content: center;
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const EmptyTitle = styled.h3`
  font-family: ${({ theme }) => theme.typography.fontFamily.display};
  font-style: italic;
  font-weight: 400;
  font-size: ${({ theme }) => theme.typography.fontSize.lg};
  color: ${({ theme }) => theme.colors.celeste};
  margin: 0 0 ${({ theme }) => theme.spacing.xs} 0;
`;

const EmptyText = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.muted};
  margin: 0 0 ${({ theme }) => theme.spacing.lg} 0;
`;

// T-901 gold audit: this used to duplicate AddButton's gold-gradient
// treatment, but both render on screen together whenever the list is empty
// (toolbar AddButton + this centred empty-state action) — two gold CTAs in
// one view, over spec §3's one-primary-CTA-per-view budget. AddButton
// already carries the sole "primary FAB/CTA" gold slot for this screen, so
// this is demoted to the secondary/glass treatment (spec §4 Buttons).
const EmptyAction = styled.button`
  ${glassControl}
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.lg};
  color: ${({ theme }) => theme.colors.onDark};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
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
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textPrimary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
`;

const AssetInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const AssetName = styled.div`
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const AssetMeta = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  color: ${({ theme }) => theme.colors.muted};
`;

const AssetTag = styled.span`
  ${monoLabel}
  display: inline-block;
  padding: 2px ${({ theme }) => theme.spacing.xs};
  background: ${({ theme }) => theme.colors.glass.base};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  color: ${({ theme }) => theme.colors.muted};
`;

const CategoryBadge = styled.span`
  ${monoLabel}
  display: inline-block;
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  background: ${({ theme }) => theme.colors.glass.base};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: 99px;
  color: ${({ theme }) => theme.colors.celeste};
`;

interface StatusBadgeProps {
  $status: PhaseKey;
}

// §4 badge pattern via the shared phaseBadge() mixin — text = phase colour,
// bg = phase 16%, border = phase 45%, glowing dot. See ASSET_STATUS_PHASE
// above for the AssetStatus -> phase mapping.
const StatusBadge = styled.span<StatusBadgeProps>`
  ${({ $status }) => phaseBadge($status)}
`;

// Overdue maintenance reads as "needs attention" — quarantined (coral),
// matching the same extrapolated vocabulary used for the repair status
// above, instead of the raw `error` token.
const OverdueDate = styled.span`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  color: ${({ theme }) => theme.colors.phase.quarantined};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
`;

// Space Mono for currency values and timestamps (spec §6/item 6).
const MonoValue = styled.span`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
`;

const Actions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
`;

interface ActionButtonProps {
  $danger?: boolean;
}

// Ghost buttons (spec §4 Buttons): transparent, celeste text/border.
// Destructive variant: coral-tinted glass, never solid red.
const ActionButton = styled.button<ActionButtonProps>`
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  background: ${({ $danger }) => ($danger ? 'rgba(240, 138, 112, 0.1)' : 'transparent')};
  border: 1px solid
    ${({ theme, $danger }) => ($danger ? 'rgba(240, 138, 112, 0.35)' : theme.colors.glass.border)};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  color: ${({ theme, $danger }) => ($danger ? theme.colors.bright.coral : theme.colors.celeste)};
  cursor: pointer;

  &:hover {
    background: ${({ $danger }) => ($danger ? 'rgba(240, 138, 112, 0.18)' : 'rgba(180, 200, 220, 0.07)')};
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
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textPrimary};
  cursor: pointer;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.glass.hi};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const PageInfo = styled.span`
  ${monoLabel}
  color: ${({ theme }) => theme.colors.celeste};
`;

// Modal Styles
const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  /* Night Observatory (T-901): scrim retinted to cosmos rgba(10,14,36,.6)
     (spec §4 Modals/drawers); still closes only via CloseButton — no
     onClick on the overlay itself, behaviour unchanged. */
  background: rgba(10, 14, 36, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;

const ModalContent = styled.div`
  ${glassPanel}
  border-radius: 20px;
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
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
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
  color: ${({ theme }) => theme.colors.muted};
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
  ${monoLabel}
  font-size: 0.68rem;
  color: ${({ theme }) => theme.colors.celeste};
  margin: 0 0 ${({ theme }) => theme.spacing.md} 0;
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
  ${monoLabel}
  display: block;
  color: ${({ theme }) => theme.colors.celeste};
  margin-bottom: ${({ theme }) => theme.spacing.xs};
`;

const Required = styled.span`
  color: ${({ theme }) => theme.colors.bright.coral};
`;

const Input = styled.input`
  ${glassControl}
  width: 100%;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
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

const TextArea = styled.textarea`
  ${glassControl}
  width: 100%;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
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

const ModalFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.spacing.md};
  padding-top: ${({ theme }) => theme.spacing.lg};
  border-top: 1px solid ${({ theme }) => theme.colors.line};
`;

// Ghost cancel (spec §4 Buttons): transparent, celeste text/border.
const CancelButton = styled.button`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.lg};
  background: transparent;
  color: ${({ theme }) => theme.colors.celeste};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  cursor: pointer;

  &:hover {
    background: rgba(180, 200, 220, 0.07);
  }
`;

// Primary CTA — same gold-gradient treatment as AddButton (spec §4 Buttons).
// Was background:primary[500] + color:white — corrected to gold-gradient +
// onAccent, matching the primary-button pattern rather than a plain onDark swap.
const SubmitButton = styled.button`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.lg};
  background: linear-gradient(145deg, ${({ theme }) => theme.colors.secondary[300]}, ${({ theme }) => theme.colors.secondary[500]});
  color: ${({ theme }) => theme.colors.onAccent};
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
  cursor: pointer;

  &:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 6px 18px rgba(220, 185, 79, 0.25);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;
