/**
 * PlantDataLibrary Component
 *
 * Main page for the Plant Data Library showing comprehensive agronomic knowledge base.
 * Features: search, filters, cards grid, pagination, and quick stats.
 */

import { useState, useEffect, useRef } from 'react';
import styled from 'styled-components';
import { PlantDataCard } from '../../components/farm/PlantDataCard';
import { PlantDataDetail } from '../../components/farm/PlantDataDetail';
import { AddPlantDataModal } from '../../components/farm/AddPlantDataModal';
import { EditPlantDataModal } from '../../components/farm/EditPlantDataModal';
import { plantDataEnhancedApi, type CSVImportResult } from '../../services/plantDataEnhancedApi';
import { useAuthStore } from '../../stores/auth.store';
import type {
  PlantDataEnhanced,
  PlantDataEnhancedSearchParams,
  FarmTypeCompatibility,
} from '../../types/farm';
import type { PlantDataFilterOptions } from '../../services/plantDataEnhancedApi';

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Container = styled.div`
  padding: 32px;
  max-width: 1440px;
  margin: 0 auto;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 32px;
  gap: 16px;
  flex-wrap: wrap;
`;

const HeaderLeft = styled.div`
  flex: 1;
  min-width: 300px;
`;

const Title = styled.h1`
  font-size: 36px;
  font-weight: 600;
  color: #212121;
  margin: 0 0 8px 0;
`;

const Subtitle = styled.p`
  font-size: 16px;
  color: #616161;
  margin: 0;
`;

const HeaderActions = styled.div`
  display: flex;
  gap: 12px;
  align-items: center;
`;

const Button = styled.button<{ $variant?: 'primary' | 'secondary' }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  border: none;
  white-space: nowrap;

  ${({ $variant }) => {
    if ($variant === 'primary') {
      return `
        background: #3B82F6;
        color: white;
        box-shadow: 0 4px 6px -1px rgba(59, 130, 246, 0.3);
        &:hover {
          background: #1976d2;
          box-shadow: 0 10px 15px -3px rgba(59, 130, 246, 0.4);
        }
      `;
    }
    return `
      background: white;
      color: #3B82F6;
      border: 2px solid #3B82F6;
      &:hover {
        background: #e3f2fd;
      }
    `;
  }}

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const StatsRow = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
`;

const StatCard = styled.div`
  background: white;
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  border-left: 4px solid #3B82F6;
`;

const StatLabel = styled.div`
  font-size: 12px;
  font-weight: 500;
  color: #9e9e9e;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
`;

const StatValue = styled.div`
  font-size: 24px;
  font-weight: 600;
  color: #212121;
`;

const FilterBar = styled.div`
  background: white;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  margin-bottom: 24px;
`;

const FilterRow = styled.div`
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
`;

const SearchInput = styled.input`
  flex: 1;
  min-width: 250px;
  padding: 12px 16px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
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

const Select = styled.select`
  padding: 12px 16px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
  background: white;
  color: #212121;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  min-width: 140px;

  &:focus {
    outline: none;
    border-color: #3B82F6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  option {
    color: #212121;
    background: white;
  }
`;

const ClearButton = styled.button`
  padding: 12px 20px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  background: white;
  color: #616161;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: #f5f5f5;
  }
`;

const CardsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 24px;
  margin-bottom: 32px;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const Pagination = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
`;

const PageButton = styled.button<{ $active?: boolean }>`
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  border: 1px solid #e0e0e0;
  background: ${({ $active }) => ($active ? '#3B82F6' : 'white')};
  color: ${({ $active }) => ($active ? 'white' : '#616161')};
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover:not(:disabled) {
    background: ${({ $active }) => ($active ? '#1976d2' : '#f5f5f5')};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const LoadingContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
`;

const Spinner = styled.div`
  width: 48px;
  height: 48px;
  border: 4px solid #e0e0e0;
  border-top-color: #3B82F6;
  border-radius: 50%;
  animation: spin 1s linear infinite;

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`;

const ErrorContainer = styled.div`
  padding: 24px;
  background: #FEE2E2;
  border: 1px solid #EF4444;
  border-radius: 8px;
  color: #EF4444;
  text-align: center;
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 64px 32px;
  color: #9e9e9e;
`;

const EmptyIcon = styled.div`
  font-size: 64px;
  margin-bottom: 16px;
`;

const EmptyTitle = styled.h3`
  font-size: 20px;
  font-weight: 600;
  color: #616161;
  margin: 0 0 8px 0;
`;

const EmptyDescription = styled.p`
  font-size: 14px;
  color: #9e9e9e;
  margin: 0;
`;

const ImportFeedback = styled.div<{ $type: 'success' | 'error' }>`
  padding: 16px 20px;
  border-radius: 8px;
  margin-bottom: 16px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  ${({ $type }) =>
    $type === 'success'
      ? `
    background: #DCFCE7;
    border: 1px solid #22C55E;
    color: #166534;
  `
      : `
    background: #FEE2E2;
    border: 1px solid #EF4444;
    color: #991B1B;
  `}
`;

const ImportFeedbackIcon = styled.span`
  font-size: 20px;
  line-height: 1;
`;

const ImportFeedbackContent = styled.div`
  flex: 1;
`;

const ImportFeedbackTitle = styled.div`
  font-weight: 600;
  margin-bottom: 4px;
`;

const ImportFeedbackDetails = styled.div`
  font-size: 14px;
`;

const HiddenFileInput = styled.input`
  display: none;
`;

// ============================================================================
// COMPONENT
// ============================================================================

export function PlantDataLibrary() {
  const { user } = useAuthStore();
  const [plants, setPlants] = useState<PlantDataEnhanced[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalPlants, setTotalPlants] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFarmType, setSelectedFarmType] = useState<FarmTypeCompatibility | ''>('');
  const [selectedContributor, setSelectedContributor] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('');
  const [filterOptions, setFilterOptions] = useState<PlantDataFilterOptions | null>(null);
  const [selectedPlant, setSelectedPlant] = useState<PlantDataEnhanced | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [plantToEdit, setPlantToEdit] = useState<PlantDataEnhanced | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<CSVImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const perPage = 12;

  // Check if user has agronomist permission
  const hasAgronomistPermission = user?.permissions?.includes('agronomist') || ['admin', 'super_admin'].includes(user?.role as string) || false;

  // Load filter options on mount
  useEffect(() => {
    loadFilterOptions();
  }, []);

  useEffect(() => {
    loadPlants();
  }, [currentPage, searchTerm, selectedFarmType, selectedContributor, selectedRegion]);

  const loadFilterOptions = async () => {
    try {
      const options = await plantDataEnhancedApi.getPlantDataFilterOptions();
      setFilterOptions(options);
    } catch (err) {
      console.error('Error loading filter options:', err);
    }
  };

  const loadPlants = async () => {
    try {
      setLoading(true);
      setError(null);

      const params: PlantDataEnhancedSearchParams = {
        page: currentPage,
        perPage,
        search: searchTerm || undefined,
        farmType: selectedFarmType || undefined,
        contributor: selectedContributor || undefined,
        targetRegion: selectedRegion || undefined,
      };

      const response = await plantDataEnhancedApi.getPlantDataEnhancedList(params);
      setPlants(response.items);
      setTotalPlants(response.total);
      setTotalPages(response.totalPages);
    } catch (err) {
      setError('Failed to load plant data. Please try again.');
      console.error('Error loading plant data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  const handleFarmTypeChange = (value: string) => {
    setSelectedFarmType(value as FarmTypeCompatibility | '');
    setCurrentPage(1);
  };

  const handleContributorChange = (value: string) => {
    setSelectedContributor(value);
    setCurrentPage(1);
  };

  const handleRegionChange = (value: string) => {
    setSelectedRegion(value);
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setSearchTerm('');
    setSelectedFarmType('');
    setSelectedContributor('');
    setSelectedRegion('');
    setCurrentPage(1);
  };

  const handleDownloadTemplate = async () => {
    try {
      await plantDataEnhancedApi.downloadPlantDataEnhancedTemplate();
    } catch (err) {
      console.error('Error downloading template:', err);
      alert('Failed to download template');
    }
  };

  const handleImportClick = () => {
    if (!hasAgronomistPermission) {
      alert('You do not have permission to import plant data. Agronomist role required.');
      return;
    }
    setImportResult(null);
    setImportError(null);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setImportError('Invalid file type. Please select a CSV file.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setImporting(true);
    setImportError(null);
    setImportResult(null);

    try {
      const result = await plantDataEnhancedApi.importPlantDataEnhancedCSV(file);
      setImportResult(result);
      loadPlants(); // Refresh the list
    } catch (err: any) {
      console.error('Error importing CSV:', err);
      // Handle different error formats
      if (err.response?.data?.detail) {
        const detail = err.response.data.detail;
        if (typeof detail === 'object' && detail.message) {
          // Format: { message: "...", errors: [...] }
          const errorMessages = detail.errors?.length > 0
            ? `${detail.message}: ${detail.errors.join(', ')}`
            : detail.message;
          setImportError(errorMessages);
        } else if (typeof detail === 'string') {
          setImportError(detail);
        } else {
          setImportError('Failed to import CSV file. Please check the file format.');
        }
      } else {
        setImportError(err.message || 'Failed to import CSV file. Please check the file format.');
      }
    } finally {
      setImporting(false);
      // Reset file input so user can select the same file again if needed
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleViewPlant = async (plantDataId: string) => {
    try {
      const plant = await plantDataEnhancedApi.getPlantDataEnhancedById(plantDataId);
      setSelectedPlant(plant);
      setShowDetailModal(true);
    } catch (err) {
      console.error('Error loading plant details:', err);
      alert('Failed to load plant details');
    }
  };

  const handleEditPlant = async (plantDataId: string) => {
    if (!hasAgronomistPermission) {
      alert('You do not have permission to edit plant data. Agronomist role required.');
      return;
    }

    try {
      const plant = await plantDataEnhancedApi.getPlantDataEnhancedById(plantDataId);
      setPlantToEdit(plant);
      setShowEditModal(true);
    } catch (err) {
      console.error('Error loading plant for edit:', err);
      alert('Failed to load plant data for editing');
    }
  };

  const handleClonePlant = async (plantDataId: string) => {
    const plant = plants.find((p) => p.plantDataId === plantDataId);
    if (!plant) return;

    const newName = prompt(`Clone "${plant.plantName}" as:`, `${plant.plantName} (Copy)`);
    if (!newName) return;

    try {
      await plantDataEnhancedApi.clonePlantDataEnhanced(plantDataId, { newPlantName: newName });
      alert('Plant cloned successfully!');
      loadPlants();
    } catch (err) {
      console.error('Error cloning plant:', err);
      alert('Failed to clone plant');
    }
  };

  const handleDeletePlant = async (plantDataId: string) => {
    try {
      await plantDataEnhancedApi.deletePlantDataEnhanced(plantDataId);
      alert('Plant deleted successfully!');
      loadPlants();
    } catch (err) {
      console.error('Error deleting plant:', err);
      alert('Failed to delete plant');
    }
  };

  const handleCreateNew = () => {
    if (!hasAgronomistPermission) {
      alert('You do not have permission to create plant data. Agronomist role required.');
      return;
    }
    setShowAddModal(true);
  };

  const handleAddSuccess = () => {
    setShowAddModal(false);
    loadPlants();
  };

  const handleEditSuccess = () => {
    setShowEditModal(false);
    setPlantToEdit(null);
    loadPlants();
  };

  if (loading) {
    return (
      <Container>
        <LoadingContainer>
          <Spinner />
        </LoadingContainer>
      </Container>
    );
  }

  if (error) {
    return (
      <Container>
        <ErrorContainer>{error}</ErrorContainer>
      </Container>
    );
  }

  return (
    <>
      <Container>
        <Header>
        <HeaderLeft>
          <Title>Plant Data Library</Title>
          <Subtitle>Comprehensive agronomic knowledge base</Subtitle>
        </HeaderLeft>
        <HeaderActions>
          <Button $variant="secondary" onClick={handleDownloadTemplate}>
            📥 Download CSV Template
          </Button>
          {hasAgronomistPermission && (
            <>
              <Button $variant="secondary" onClick={handleImportClick} disabled={importing}>
                {importing ? '⏳ Importing...' : '📤 Import CSV'}
              </Button>
              <Button $variant="primary" onClick={handleCreateNew}>
                ➕ New Plant
              </Button>
            </>
          )}
        </HeaderActions>
      </Header>

      {/* Hidden file input for CSV import */}
      <HiddenFileInput
        type="file"
        ref={fileInputRef}
        accept=".csv"
        onChange={handleFileChange}
      />

      {/* Import result feedback */}
      {importResult && (
        <ImportFeedback $type="success">
          <ImportFeedbackIcon>✅</ImportFeedbackIcon>
          <ImportFeedbackContent>
            <ImportFeedbackTitle>CSV Import Successful</ImportFeedbackTitle>
            <ImportFeedbackDetails>
              {importResult.created} plant(s) created, {importResult.updated} plant(s) updated
              {importResult.errors && importResult.errors.length > 0 && (
                <div style={{ marginTop: '8px', fontSize: '13px' }}>
                  <strong>Warnings:</strong> {importResult.errors.join('; ')}
                </div>
              )}
            </ImportFeedbackDetails>
          </ImportFeedbackContent>
        </ImportFeedback>
      )}

      {/* Import error feedback */}
      {importError && (
        <ImportFeedback $type="error">
          <ImportFeedbackIcon>❌</ImportFeedbackIcon>
          <ImportFeedbackContent>
            <ImportFeedbackTitle>CSV Import Failed</ImportFeedbackTitle>
            <ImportFeedbackDetails>{importError}</ImportFeedbackDetails>
          </ImportFeedbackContent>
        </ImportFeedback>
      )}

      <StatsRow>
        <StatCard>
          <StatLabel>Total Plants</StatLabel>
          <StatValue>{totalPlants}</StatValue>
        </StatCard>
        <StatCard>
          <StatLabel>Filtered Results</StatLabel>
          <StatValue>{plants.length}</StatValue>
        </StatCard>
        <StatCard>
          <StatLabel>Current Page</StatLabel>
          <StatValue>
            {currentPage} / {totalPages}
          </StatValue>
        </StatCard>
      </StatsRow>

      <FilterBar>
        <FilterRow>
          <SearchInput
            type="text"
            placeholder="Search plants by name, scientific name, or tags..."
            value={searchTerm}
            onChange={(e) => handleSearch(e.target.value)}
          />
          <Select value={selectedFarmType} onChange={(e) => handleFarmTypeChange(e.target.value)}>
            <option value="">All Farm Types</option>
            <option value="open_field">Open Field</option>
            <option value="greenhouse">Greenhouse</option>
            <option value="hydroponic">Hydroponic</option>
            <option value="vertical_farm">Vertical Farm</option>
            <option value="aquaponic">Aquaponic</option>
            <option value="indoor_farm">Indoor Farm</option>
            <option value="polytunnel">Polytunnel</option>
          </Select>
          <Select value={selectedContributor} onChange={(e) => handleContributorChange(e.target.value)}>
            <option value="">All Contributors</option>
            {filterOptions?.contributors?.map((contributor) => (
              <option key={contributor} value={contributor}>
                {contributor}
              </option>
            ))}
          </Select>
          <Select value={selectedRegion} onChange={(e) => handleRegionChange(e.target.value)}>
            <option value="">All Regions</option>
            {filterOptions?.targetRegions?.map((region) => (
              <option key={region} value={region}>
                {region}
              </option>
            ))}
          </Select>
          <ClearButton onClick={handleClearFilters}>Clear Filters</ClearButton>
        </FilterRow>
      </FilterBar>

      {plants.length === 0 ? (
        <EmptyState>
          <EmptyIcon>🌱</EmptyIcon>
          <EmptyTitle>No plants found</EmptyTitle>
          <EmptyDescription>
            {searchTerm || selectedFarmType || selectedContributor || selectedRegion
              ? 'Try adjusting your filters or search term'
              : 'Get started by creating your first plant data entry'}
          </EmptyDescription>
        </EmptyState>
      ) : (
        <>
          <CardsGrid>
            {plants.map((plant) => (
              <PlantDataCard
                key={plant.plantDataId}
                plant={plant}
                onView={handleViewPlant}
                onEdit={hasAgronomistPermission ? handleEditPlant : undefined}
                onClone={hasAgronomistPermission ? handleClonePlant : undefined}
                onDelete={hasAgronomistPermission ? handleDeletePlant : undefined}
              />
            ))}
          </CardsGrid>

          {totalPages > 1 && (
            <Pagination>
              <PageButton
                onClick={() => setCurrentPage(currentPage - 1)}
                disabled={currentPage === 1}
              >
                ‹ Previous
              </PageButton>

              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }

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
                onClick={() => setCurrentPage(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                Next ›
              </PageButton>
            </Pagination>
          )}
        </>
      )}
      </Container>

      {/* Detail Modal */}
      {showDetailModal && selectedPlant && (
        <PlantDataDetail
          plant={selectedPlant}
          onClose={() => {
            setShowDetailModal(false);
            setSelectedPlant(null);
          }}
          onEdit={hasAgronomistPermission ? (id) => {
            setShowDetailModal(false);
            handleEditPlant(id);
          } : undefined}
          onClone={hasAgronomistPermission ? async (id) => {
            setShowDetailModal(false);
            await handleClonePlant(id);
          } : undefined}
          onDelete={hasAgronomistPermission ? async (id) => {
            setShowDetailModal(false);
            await handleDeletePlant(id);
          } : undefined}
        />
      )}

      {/* Add Plant Data Modal - Conditional Rendering */}
      {showAddModal && (
        <AddPlantDataModal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          onSuccess={handleAddSuccess}
        />
      )}

      {/* Edit Plant Data Modal - Conditional Rendering */}
      {showEditModal && plantToEdit && (
        <EditPlantDataModal
          isOpen={showEditModal}
          plantData={plantToEdit}
          onClose={() => {
            setShowEditModal(false);
            setPlantToEdit(null);
          }}
          onSuccess={handleEditSuccess}
        />
      )}
    </>
  );
}
