/**
 * InventoryPage Component
 *
 * Main page for managing harvest inventory.
 */

import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { InventoryTable } from '../../components/sales/InventoryTable';
import { InventoryForm } from '../../components/sales/InventoryForm';
import { salesService } from '../../services/salesService';
import type { HarvestInventory, HarvestInventoryCreate, HarvestInventoryUpdate, InventorySearchParams } from '../../types/sales';

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const PageContainer = styled.div`
  padding: 24px;
  max-width: 1400px;
  margin: 0 auto;
`;

const PageHeader = styled.div`
  margin-bottom: 32px;
`;

const PageTitle = styled.h1`
  font-size: 32px;
  font-weight: 600;
  color: #212121;
  margin: 0 0 8px 0;
`;

const PageDescription = styled.p`
  font-size: 16px;
  color: #616161;
  margin: 0;
`;

const Actions = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  gap: 16px;
  flex-wrap: wrap;
`;

const FiltersGroup = styled.div`
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  flex: 1;
`;

const Select = styled.select`
  padding: 10px 16px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
  background: white;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:focus {
    outline: none;
    border-color: #3B82F6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
`;

const SearchInput = styled.input`
  padding: 10px 16px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
  min-width: 250px;
  transition: all 150ms ease-in-out;

  &:focus {
    outline: none;
    border-color: #3B82F6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  &::placeholder {
    color: #9e9e9e;
  }
`;

const Button = styled.button<{ $variant?: 'primary' | 'secondary' }>`
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  border: none;

  ${({ $variant }) => {
    if ($variant === 'secondary') {
      return `
        background: transparent;
        color: #616161;
        border: 1px solid #e0e0e0;
        &:hover {
          background: #f5f5f5;
        }
      `;
    }
    return `
      background: #3B82F6;
      color: white;
      &:hover {
        background: #1976d2;
      }
      &:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
    `;
  }}
`;

const Modal = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
`;

const ModalContent = styled.div`
  background: white;
  border-radius: 16px;
  padding: 32px;
  max-width: 800px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
`;

const ModalHeader = styled.div`
  margin-bottom: 24px;
`;

const ModalTitle = styled.h2`
  font-size: 24px;
  font-weight: 600;
  color: #212121;
  margin: 0;
`;

const LoadingState = styled.div`
  text-align: center;
  padding: 48px;
  color: #9e9e9e;
`;

const ErrorState = styled.div`
  background: #FEE2E2;
  border: 1px solid #EF4444;
  border-radius: 8px;
  padding: 16px;
  color: #B91C1C;
  margin-bottom: 24px;
`;

// ============================================================================
// COMPONENT
// ============================================================================

export function InventoryPage() {
  const [inventory, setInventory] = useState<HarvestInventory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingInventory, setEditingInventory] = useState<HarvestInventory | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [qualityFilter, setQualityFilter] = useState<string>('');

  useEffect(() => {
    loadInventory();
  }, []);

  const loadInventory = async (params?: InventorySearchParams) => {
    try {
      setLoading(true);
      setError(null);
      const data = await salesService.getInventory(params);
      setInventory(data.items);
    } catch (err: any) {
      setError(err.message || 'Failed to load inventory');
      console.error('Failed to load inventory:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    // Truncate search query to prevent issues with very long strings
    const truncatedSearch = searchQuery ? searchQuery.slice(0, 500) : undefined;
    const params: InventorySearchParams = {
      search: truncatedSearch || undefined,
      status: statusFilter || undefined,
      quality: qualityFilter || undefined,
    };
    loadInventory(params);
  };

  const handleReset = () => {
    setSearchQuery('');
    setStatusFilter('');
    setQualityFilter('');
    loadInventory();
  };

  const handleCreate = () => {
    setEditingInventory(undefined);
    setIsModalOpen(true);
  };

  const handleEdit = (inventoryId: string) => {
    const item = inventory.find((inv) => inv.inventoryId === inventoryId);
    if (item) {
      setEditingInventory(item);
      setIsModalOpen(true);
    }
  };

  const handleDelete = async (inventoryId: string) => {
    try {
      await salesService.deleteInventory(inventoryId);
      await loadInventory();
    } catch (err: any) {
      alert(`Failed to delete inventory: ${err.message}`);
    }
  };

  const handleSubmit = async (data: HarvestInventoryCreate | HarvestInventoryUpdate) => {
    try {
      setIsSubmitting(true);
      if (editingInventory) {
        await salesService.updateInventory(editingInventory.inventoryId, data);
      } else {
        await salesService.createInventory(data);
      }
      setIsModalOpen(false);
      setEditingInventory(undefined);
      await loadInventory();
    } catch (err: any) {
      alert(`Failed to save inventory: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setIsModalOpen(false);
    setEditingInventory(undefined);
  };

  return (
    <PageContainer>
      <PageHeader>
        <PageTitle>Harvest Inventory</PageTitle>
        <PageDescription>Manage harvest products and stock levels</PageDescription>
      </PageHeader>

      {error && <ErrorState>{error}</ErrorState>}

      <Actions>
        <FiltersGroup>
          <SearchInput
            type="text"
            placeholder="Search by product name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
          />

          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All Status</option>
            <option value="available">Available</option>
            <option value="reserved">Reserved</option>
            <option value="sold">Sold</option>
            <option value="expired">Expired</option>
          </Select>

          <Select value={qualityFilter} onChange={(e) => setQualityFilter(e.target.value)}>
            <option value="">All Quality</option>
            <option value="A">Grade A</option>
            <option value="B">Grade B</option>
            <option value="C">Grade C</option>
          </Select>

          <Button $variant="secondary" onClick={handleSearch}>
            Search
          </Button>

          <Button $variant="secondary" onClick={handleReset}>
            Reset
          </Button>
        </FiltersGroup>

        <Button $variant="primary" onClick={handleCreate}>
          + Add Inventory
        </Button>
      </Actions>

      {loading ? (
        <LoadingState>Loading inventory...</LoadingState>
      ) : (
        <InventoryTable inventory={inventory} onEdit={handleEdit} onDelete={handleDelete} />
      )}

      {isModalOpen && (
        <Modal onClick={handleCancel}>
          <ModalContent onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>{editingInventory ? 'Edit Inventory Item' : 'Add New Inventory Item'}</ModalTitle>
            </ModalHeader>
            <InventoryForm
              inventory={editingInventory}
              onSubmit={handleSubmit}
              onCancel={handleCancel}
              isSubmitting={isSubmitting}
            />
          </ModalContent>
        </Modal>
      )}
    </PageContainer>
  );
}
