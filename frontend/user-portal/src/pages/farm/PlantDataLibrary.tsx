/**
 * PlantDataLibrary Component
 *
 * Main page for the Plant Data Library. Plant Library Phase 3 (frontend):
 * cards are now MOTHER plants (products) — plantName, scientificName,
 * plantType, and how many varieties (cultivation recipes) they hold.
 * Detailed cultivation data (density, fertigation, yield, waste %, farm
 * type compatibility, etc.) lives one level down, on each variety —
 * reachable via a mother's "Add Variety" action or by opening its detail.
 */

import { useState, useEffect, useRef } from 'react';
import styled from 'styled-components';
import { Download, Loader2, Upload, Plus, CheckCircle2, XCircle, Sprout } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { PlantMotherCard } from '../../components/farm/PlantMotherCard';
import { PlantMotherFormModal } from '../../components/farm/PlantMotherFormModal';
import { PlantMotherDetailModal } from '../../components/farm/PlantMotherDetailModal';
import { PlantDataFormModal } from '../../components/farm/PlantDataFormModal';
import type { PlantDataFormModalMotherContext } from '../../components/farm/PlantDataFormModal';
import { plantDataEnhancedApi, type CSVImportResult } from '../../services/plantDataEnhancedApi';
import { usePlantMothers, useDeletePlantMother } from '../../hooks/queries/usePlantMothers';
import { queryKeys } from '../../config/react-query.config';
import { useAuthStore } from '../../stores/auth.store';
import type { PlantDataEnhanced } from '../../types/farm';

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
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 8px 0;
`;

const Subtitle = styled.p`
  font-size: 16px;
  color: ${({ theme }) => theme.colors.textSecondary};
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

  svg.spinning {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  ${({ $variant, theme }) => {
    if ($variant === 'primary') {
      return `
        background: ${theme.colors.primary[500]};
        color: ${theme.colors.onDark};
        box-shadow: 0 4px 6px -1px ${theme.colors.primary[500]}4d;
        &:hover {
          background: ${theme.colors.primary[600]};
          box-shadow: 0 10px 15px -3px ${theme.colors.primary[500]}66;
        }
      `;
    }
    return `
      background: transparent;
      color: ${theme.colors.primary[500]};
      border: 2px solid ${theme.colors.primary[500]};
      &:hover {
        background: ${theme.colors.primary[50]};
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
  background: ${({ theme }) => theme.colors.background};
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  border-left: 4px solid ${({ theme }) => theme.colors.primary[500]};
`;

const StatLabel = styled.div`
  font-size: 12px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.textDisabled};
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
`;

const StatValue = styled.div`
  font-size: 24px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const FilterBar = styled.div`
  background: ${({ theme }) => theme.colors.background};
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
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.textPrimary};
  transition: all 150ms ease-in-out;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary[500]};
    box-shadow: ${({ theme }) => `0 0 0 3px ${theme.colors.primary[500]}1a`};
  }

  &::placeholder {
    color: ${({ theme }) => theme.colors.textDisabled};
  }
`;

const ClearButton = styled.button`
  padding: 12px 20px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: ${({ theme }) => theme.colors.surface};
  }
`;

const CardsGrid = styled.div<{ $loading?: boolean }>`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 24px;
  margin-bottom: 32px;
  opacity: ${({ $loading }) => ($loading ? 0.5 : 1)};
  pointer-events: ${({ $loading }) => ($loading ? 'none' : 'auto')};
  transition: opacity 150ms ease-in-out;

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
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  background: ${({ $active, theme }) => ($active ? theme.colors.primary[500] : theme.colors.background)};
  color: ${({ $active, theme }) => ($active ? theme.colors.onDark : theme.colors.textSecondary)};
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover:not(:disabled) {
    background: ${({ $active, theme }) => ($active ? theme.colors.primary[600] : theme.colors.surface)};
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
  border: 4px solid ${({ theme }) => theme.colors.neutral[300]};
  border-top-color: ${({ theme }) => theme.colors.primary[500]};
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
  background: ${({ theme }) => theme.colors.errorBg};
  border: 1px solid ${({ theme }) => theme.colors.error};
  border-radius: 8px;
  color: ${({ theme }) => theme.colors.error};
  text-align: center;
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 64px 32px;
  color: ${({ theme }) => theme.colors.textDisabled};
`;

const EmptyIcon = styled.div`
  display: flex;
  justify-content: center;
  color: ${({ theme }) => theme.colors.celeste};
  opacity: 0.7;
  margin-bottom: 16px;
`;

const EmptyTitle = styled.h3`
  font-size: 20px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0 0 8px 0;
`;

const EmptyDescription = styled.p`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textDisabled};
  margin: 0;
`;

const ImportFeedback = styled.div<{ $type: 'success' | 'error' }>`
  padding: 16px 20px;
  border-radius: 8px;
  margin-bottom: 16px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  ${({ $type, theme }) =>
    $type === 'success'
      ? `
    background: ${theme.colors.successBg};
    border: 1px solid ${theme.colors.success};
    color: ${theme.colors.emerald[800]};
  `
      : `
    background: ${theme.colors.errorBg};
    border: 1px solid ${theme.colors.error};
    color: ${theme.colors.terracotta[800]};
  `}
`;

const ImportFeedbackIcon = styled.span`
  display: flex;
  flex-shrink: 0;
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

const ProgressContainer = styled.div`
  margin-bottom: 16px;
  padding: 16px 20px;
  background: ${({ theme }) => theme.colors.primary[50]};
  border: 1px solid ${({ theme }) => theme.colors.primary[500]};
  border-radius: 8px;
`;

const ProgressHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
`;

const ProgressLabel = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.primary[800]};
`;

const ProgressPercent = styled.span`
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.primary[500]};
`;

const ProgressBarOuter = styled.div`
  width: 100%;
  height: 8px;
  background: ${({ theme }) => theme.colors.primary[100]};
  border-radius: 4px;
  overflow: hidden;
`;

const ProgressBarInner = styled.div<{ $progress: number }>`
  width: ${({ $progress }) => $progress}%;
  height: 100%;
  background: ${({ theme }) => `linear-gradient(90deg, ${theme.colors.primary[500]} 0%, ${theme.colors.primary[700]} 100%)`};
  border-radius: 4px;
  transition: width 200ms ease-out;
`;

// ============================================================================
// COMPONENT
// ============================================================================

export function PlantDataLibrary() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Mother modal state (create/edit) — motherIdToEdit null means create mode.
  const [motherFormOpen, setMotherFormOpen] = useState(false);
  const [motherIdToEdit, setMotherIdToEdit] = useState<string | null>(null);

  // Mother detail modal (view varieties) — id-based so it always reflects
  // the latest cached data after any mutation invalidates the list.
  const [motherDetailId, setMotherDetailId] = useState<string | null>(null);

  // Variety form modal (PlantDataFormModal in variety mode) — either
  // creating under a mother, editing an existing variety, or duplicating one
  // (create under the same mother, pre-filled from the source variety).
  const [varietyFormOpen, setVarietyFormOpen] = useState(false);
  const [varietyFormMotherId, setVarietyFormMotherId] = useState<string | null>(null);
  const [varietyFormPlantData, setVarietyFormPlantData] = useState<PlantDataEnhanced | null>(null);
  const [varietyFormDuplicateSource, setVarietyFormDuplicateSource] = useState<PlantDataEnhanced | null>(null);

  const [importing, setImporting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [importResult, setImportResult] = useState<CSVImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const perPage = 12;

  // Check if user has agronomist permission
  const hasAgronomistPermission = user?.permissions?.includes('agronomist') || ['admin', 'super_admin'].includes(user?.role as string) || false;

  // Debounce search term (300ms delay)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const mothersQuery = usePlantMothers(currentPage, perPage, debouncedSearch || undefined);
  const deleteMother = useDeletePlantMother();

  const mothers = mothersQuery.data?.items ?? [];
  const totalMothers = mothersQuery.data?.total ?? 0;
  const totalPages = mothersQuery.data?.totalPages ?? 1;
  const initialLoading = mothersQuery.isLoading && !mothersQuery.data;
  const loading = mothersQuery.isFetching;

  // Derive the mother record for whichever modal is open from the current
  // page's cache — always fresh after a mutation invalidates the list.
  const motherToEdit = motherIdToEdit ? mothers.find((m) => m.plantMotherId === motherIdToEdit) ?? null : null;
  const motherForDetail = motherDetailId ? mothers.find((m) => m.plantMotherId === motherDetailId) ?? null : null;
  const motherForVarietyCreate = varietyFormMotherId
    ? mothers.find((m) => m.plantMotherId === varietyFormMotherId) ?? null
    : null;
  const varietyMotherContext: PlantDataFormModalMotherContext | null = motherForVarietyCreate
    ? {
        plantMotherId: motherForVarietyCreate.plantMotherId,
        plantName: motherForVarietyCreate.plantName,
        scientificName: motherForVarietyCreate.scientificName,
        plantType: motherForVarietyCreate.plantType,
      }
    : null;

  const handleSearch = (value: string) => {
    setSearchTerm(value);
  };

  const handleClearFilters = () => {
    setSearchTerm('');
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
    setUploadProgress(0);
    setImportError(null);
    setImportResult(null);

    try {
      const result = await plantDataEnhancedApi.importPlantDataEnhancedCSV(
        file,
        (progress) => setUploadProgress(progress)
      );
      setImportResult(result);
      // CSV import writes to plant_data_enhanced directly (untouched by
      // Plant Library Phase 2/3) — refresh mothers in case any imported
      // rows resolved onto existing products' varietyCount.
      queryClient.invalidateQueries({ queryKey: queryKeys.plantMothers.lists() });
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
      setUploadProgress(0);
      // Reset file input so user can select the same file again if needed
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleCreateNew = () => {
    if (!hasAgronomistPermission) {
      alert('You do not have permission to create plant data. Agronomist role required.');
      return;
    }
    setMotherIdToEdit(null);
    setMotherFormOpen(true);
  };

  const handleEditMother = (motherId: string) => {
    if (!hasAgronomistPermission) {
      alert('You do not have permission to edit plant data. Agronomist role required.');
      return;
    }
    setMotherIdToEdit(motherId);
    setMotherFormOpen(true);
  };

  const handleViewMother = (motherId: string) => {
    setMotherDetailId(motherId);
  };

  const handleAddVariety = (motherId: string) => {
    if (!hasAgronomistPermission) {
      alert('You do not have permission to create plant data. Agronomist role required.');
      return;
    }
    setVarietyFormMotherId(motherId);
    setVarietyFormPlantData(null);
    setVarietyFormDuplicateSource(null);
    setVarietyFormOpen(true);
  };

  const handleEditVariety = (variety: PlantDataEnhanced) => {
    setVarietyFormMotherId(null);
    setVarietyFormPlantData(variety);
    setVarietyFormDuplicateSource(null);
    setVarietyFormOpen(true);
  };

  // Duplicate: opens the same variety-create form as "Add Variety", under
  // the source variety's own mother, pre-filled from its data (see
  // PlantDataFormModal's duplicateFromVariety prop). plantData stays null —
  // this always submits through the CREATE path, never touching the source.
  const handleDuplicateVariety = (variety: PlantDataEnhanced) => {
    if (!hasAgronomistPermission) {
      alert('You do not have permission to create plant data. Agronomist role required.');
      return;
    }
    if (!variety.motherPlantId) {
      // Should not happen in the mother/variety hierarchy — every variety
      // reachable from PlantMotherDetailModal belongs to a mother.
      console.error('Cannot duplicate variety: missing motherPlantId', variety);
      return;
    }
    setVarietyFormMotherId(variety.motherPlantId);
    setVarietyFormPlantData(null);
    setVarietyFormDuplicateSource(variety);
    setVarietyFormOpen(true);
  };

  const handleDeleteMother = async (motherId: string) => {
    try {
      await deleteMother.mutateAsync(motherId);
      alert('Plant deleted successfully!');
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      if (err?.response?.status === 409 && typeof detail === 'string') {
        // Guard message from the backend: this mother still has active
        // varieties — remove/deactivate them first (never cascade-deleted).
        alert(detail);
      } else {
        console.error('Error deleting mother:', err);
        alert('Failed to delete plant.');
      }
    }
  };

  const handleMotherFormClose = () => {
    setMotherFormOpen(false);
    setMotherIdToEdit(null);
  };

  const handleVarietyFormClose = () => {
    setVarietyFormOpen(false);
    setVarietyFormMotherId(null);
    setVarietyFormPlantData(null);
    setVarietyFormDuplicateSource(null);
  };

  const handleVarietyFormSuccess = () => {
    // A variety UPDATE (not create — the create hook already invalidates)
    // doesn't go through a TanStack mutation, so refresh explicitly here.
    const motherId = varietyFormMotherId || varietyFormPlantData?.motherPlantId;
    if (motherId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.plantMothers.varieties(motherId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.plantMothers.lists() });
    }
    handleVarietyFormClose();
  };

  if (initialLoading) {
    return (
      <Container>
        <LoadingContainer>
          <Spinner />
        </LoadingContainer>
      </Container>
    );
  }

  if (mothersQuery.isError && mothers.length === 0) {
    return (
      <Container>
        <ErrorContainer>Failed to load plant data. Please try again.</ErrorContainer>
      </Container>
    );
  }

  return (
    <>
      <Container>
        <Header>
        <HeaderLeft>
          <Title>Plant Data Library</Title>
          <Subtitle>Comprehensive agronomic knowledge base — organized by product</Subtitle>
        </HeaderLeft>
        <HeaderActions>
          <Button $variant="secondary" onClick={handleDownloadTemplate}>
            <Download size={15} strokeWidth={1.8} /> Download CSV Template
          </Button>
          {hasAgronomistPermission && (
            <>
              <Button $variant="secondary" onClick={handleImportClick} disabled={importing}>
                {importing ? (
                  <>
                    <Loader2 size={15} strokeWidth={1.8} className="spinning" /> Importing...
                  </>
                ) : (
                  <>
                    <Upload size={15} strokeWidth={1.8} /> Import CSV
                  </>
                )}
              </Button>
              <Button $variant="primary" onClick={handleCreateNew}>
                <Plus size={15} strokeWidth={2} /> New Plant
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

      {/* Upload progress indicator */}
      {importing && (
        <ProgressContainer>
          <ProgressHeader>
            <ProgressLabel>
              <Upload size={14} strokeWidth={1.8} /> Uploading CSV file...
            </ProgressLabel>
            <ProgressPercent>{uploadProgress}%</ProgressPercent>
          </ProgressHeader>
          <ProgressBarOuter>
            <ProgressBarInner $progress={uploadProgress} />
          </ProgressBarOuter>
        </ProgressContainer>
      )}

      {/* Import result feedback */}
      {importResult && (
        <ImportFeedback $type="success">
          <ImportFeedbackIcon><CheckCircle2 size={20} strokeWidth={1.8} /></ImportFeedbackIcon>
          <ImportFeedbackContent>
            <ImportFeedbackTitle>CSV Import Complete</ImportFeedbackTitle>
            <ImportFeedbackDetails>
              {importResult.varietiesCreated} variet{importResult.varietiesCreated === 1 ? 'y' : 'ies'} created
              {' · '}{importResult.mothersCreated} new plant{importResult.mothersCreated === 1 ? '' : 's'}
              {importResult.mothersReused > 0 && `, ${importResult.mothersReused} existing reused`}
              {' · '}{importResult.totalRows} row(s) processed
              {importResult.rowsSkipped.length > 0 && (
                <div style={{ marginTop: '8px', fontSize: '13px' }}>
                  <strong>Skipped ({importResult.rowsSkipped.length}):</strong>{' '}
                  {importResult.rowsSkipped.map((s) => `row ${s.row}: ${s.reason}`).join('; ')}
                </div>
              )}
              {importResult.rowsFailed.length > 0 && (
                <div style={{ marginTop: '8px', fontSize: '13px', color: '#b91c1c' }}>
                  <strong>Failed ({importResult.rowsFailed.length}):</strong>{' '}
                  {importResult.rowsFailed.map((f) => `row ${f.row}: ${f.error}`).join('; ')}
                </div>
              )}
            </ImportFeedbackDetails>
          </ImportFeedbackContent>
        </ImportFeedback>
      )}

      {/* Import error feedback */}
      {importError && (
        <ImportFeedback $type="error">
          <ImportFeedbackIcon><XCircle size={20} strokeWidth={1.8} /></ImportFeedbackIcon>
          <ImportFeedbackContent>
            <ImportFeedbackTitle>CSV Import Failed</ImportFeedbackTitle>
            <ImportFeedbackDetails>{importError}</ImportFeedbackDetails>
          </ImportFeedbackContent>
        </ImportFeedback>
      )}

      <StatsRow>
        <StatCard>
          <StatLabel>Total Products</StatLabel>
          <StatValue>{totalMothers}</StatValue>
        </StatCard>
        <StatCard>
          <StatLabel>Shown on This Page</StatLabel>
          <StatValue>{mothers.length}</StatValue>
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
            placeholder="Search products by name or scientific name..."
            value={searchTerm}
            onChange={(e) => handleSearch(e.target.value)}
          />
          <ClearButton onClick={handleClearFilters}>Clear Filters</ClearButton>
        </FilterRow>
      </FilterBar>

      {mothers.length === 0 ? (
        <EmptyState>
          <EmptyIcon><Sprout size={40} strokeWidth={1.4} /></EmptyIcon>
          <EmptyTitle>No plants found</EmptyTitle>
          <EmptyDescription>
            {searchTerm
              ? 'Try adjusting your search term'
              : 'Get started by creating your first plant'}
          </EmptyDescription>
        </EmptyState>
      ) : (
        <>
          <CardsGrid $loading={loading}>
            {mothers.map((mother) => (
              <PlantMotherCard
                key={mother.plantMotherId}
                mother={mother}
                onView={handleViewMother}
                onEdit={hasAgronomistPermission ? handleEditMother : undefined}
                onDelete={hasAgronomistPermission ? handleDeleteMother : undefined}
                onAddVariety={hasAgronomistPermission ? handleAddVariety : undefined}
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

      {/* Mother Detail Modal (view/manage a product's varieties) */}
      {motherForDetail && (
        <PlantMotherDetailModal
          mother={motherForDetail}
          onClose={() => setMotherDetailId(null)}
          onEditMother={hasAgronomistPermission ? handleEditMother : undefined}
          onAddVariety={hasAgronomistPermission ? handleAddVariety : undefined}
          onEditVariety={hasAgronomistPermission ? handleEditVariety : undefined}
          onDuplicateVariety={hasAgronomistPermission ? handleDuplicateVariety : undefined}
        />
      )}

      {/* Create/Edit Mother Modal */}
      {motherFormOpen && (
        <PlantMotherFormModal
          isOpen={motherFormOpen}
          mother={motherToEdit}
          onClose={handleMotherFormClose}
          onSuccess={handleMotherFormClose}
        />
      )}

      {/* Create/Edit Variety Modal (PlantDataFormModal in variety mode) */}
      {varietyFormOpen && (varietyMotherContext || varietyFormPlantData) && (
        <PlantDataFormModal
          isOpen={varietyFormOpen}
          plantData={varietyFormPlantData}
          motherContext={varietyMotherContext}
          duplicateFromVariety={varietyFormDuplicateSource}
          onClose={handleVarietyFormClose}
          onSuccess={handleVarietyFormSuccess}
        />
      )}
    </>
  );
}
