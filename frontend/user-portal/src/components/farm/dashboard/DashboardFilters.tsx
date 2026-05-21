/**
 * DashboardFilters Component
 *
 * Provides filtering and sorting controls for dashboard blocks.
 * Includes state filters, search, performance filters, and sort options.
 */

import { useState } from 'react';
import styled from 'styled-components';
import type { DashboardBlockStatus, PerformanceCategory } from '../../../types/farm';
import type { SortOption, SortDirection } from '../../../hooks/farm/useDashboardFilters';

interface DashboardFiltersProps {
  // Filter state
  selectedStates: Set<DashboardBlockStatus>;
  searchQuery: string;
  selectedPerformance: Set<PerformanceCategory>;
  showDelayedOnly: boolean;
  showAlertsOnly: boolean;

  // Sort state
  sortBy: SortOption;
  sortDirection: SortDirection;

  // Callbacks
  onStateToggle: (state: DashboardBlockStatus) => void;
  onSearchChange: (query: string) => void;
  onPerformanceToggle: (category: PerformanceCategory) => void;
  onDelayedToggle: (show: boolean) => void;
  onAlertsToggle: (show: boolean) => void;
  onSortChange: (sort: SortOption) => void;
  onSortDirectionToggle: () => void;
  onClearFilters: () => void;

  // Metrics
  totalBlocks: number;
  filteredCount: number;
}

const STATE_OPTIONS: { value: DashboardBlockStatus; label: string; icon: string; color: string }[] = [
  { value: 'empty', label: 'Empty', icon: '⚪', color: '#4B4844' },
  { value: 'planned', label: 'Planned', icon: '🔵', color: '#0F6E56' },
  { value: 'planted', label: 'Planted', icon: '🟢', color: '#0F6E56' },
  { value: 'growing', label: 'Growing', icon: '🌿', color: '#84CC16' },
  { value: 'fruiting', label: 'Fruiting', icon: '🍇', color: '#FBBF24' },
  { value: 'harvesting', label: 'Harvesting', icon: '🧺', color: '#B8842A' },
  { value: 'cleaning', label: 'Cleaning', icon: '🧹', color: '#4B4844' },
];

const PERFORMANCE_OPTIONS: { value: PerformanceCategory; label: string; icon: string }[] = [
  { value: 'exceptional', label: 'Exceptional', icon: '🏆' },
  { value: 'exceeding', label: 'Exceeding', icon: '🎯' },
  { value: 'excellent', label: 'Excellent', icon: '⭐' },
  { value: 'good', label: 'Good', icon: '✅' },
  { value: 'acceptable', label: 'Acceptable', icon: '🟡' },
  { value: 'poor', label: 'Poor', icon: '🔴' },
];

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'blockCode', label: 'Block Code' },
  { value: 'state', label: 'State' },
  { value: 'daysInState', label: 'Days in State' },
  { value: 'capacity', label: 'Capacity' },
  { value: 'yieldProgress', label: 'Yield Progress' },
  { value: 'performance', label: 'Performance' },
  { value: 'delay', label: 'Delay' },
];

export function DashboardFilters({
  selectedStates,
  searchQuery,
  selectedPerformance,
  showDelayedOnly,
  showAlertsOnly,
  sortBy,
  sortDirection,
  onStateToggle,
  onSearchChange,
  onPerformanceToggle,
  onDelayedToggle,
  onAlertsToggle,
  onSortChange,
  onSortDirectionToggle,
  onClearFilters,
  totalBlocks,
  filteredCount,
}: DashboardFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const hasActiveFilters =
    selectedStates.size > 0 ||
    searchQuery.trim() !== '' ||
    selectedPerformance.size > 0 ||
    showDelayedOnly ||
    showAlertsOnly;

  return (
    <Container>
      <TopRow>
        <SearchSection>
          <SearchInput
            type="text"
            placeholder="Search blocks (code, name, crop)..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </SearchSection>

        <ControlsSection>
          <ResultsCount>
            Showing {filteredCount} of {totalBlocks} blocks
          </ResultsCount>

          <SortControl>
            <SortLabel>Sort by:</SortLabel>
            <SortSelect value={sortBy} onChange={(e) => onSortChange(e.target.value as SortOption)}>
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SortSelect>
            <SortDirectionButton onClick={onSortDirectionToggle}>
              {sortDirection === 'asc' ? '↑' : '↓'}
            </SortDirectionButton>
          </SortControl>

          <ExpandButton onClick={() => setIsExpanded(!isExpanded)}>
            {isExpanded ? '▼' : '▶'} Filters
            {hasActiveFilters && <ActiveIndicator />}
          </ExpandButton>

          {hasActiveFilters && (
            <ClearButton onClick={onClearFilters}>Clear All</ClearButton>
          )}
        </ControlsSection>
      </TopRow>

      {isExpanded && (
        <ExpandedFilters>
          {/* State Filters */}
          <FilterGroup>
            <FilterGroupTitle>Filter by State:</FilterGroupTitle>
            <ChipGrid>
              {STATE_OPTIONS.map((option) => (
                <StateChip
                  key={option.value}
                  $isSelected={selectedStates.has(option.value)}
                  $color={option.color}
                  onClick={() => onStateToggle(option.value)}
                >
                  <ChipIcon>{option.icon}</ChipIcon>
                  <ChipLabel>{option.label}</ChipLabel>
                </StateChip>
              ))}
            </ChipGrid>
          </FilterGroup>

          {/* Performance Filters */}
          <FilterGroup>
            <FilterGroupTitle>Filter by Performance:</FilterGroupTitle>
            <ChipGrid>
              {PERFORMANCE_OPTIONS.map((option) => (
                <PerformanceChip
                  key={option.value}
                  $isSelected={selectedPerformance.has(option.value)}
                  onClick={() => onPerformanceToggle(option.value)}
                >
                  <ChipIcon>{option.icon}</ChipIcon>
                  <ChipLabel>{option.label}</ChipLabel>
                </PerformanceChip>
              ))}
            </ChipGrid>
          </FilterGroup>

          {/* Toggle Filters */}
          <FilterGroup>
            <FilterGroupTitle>Quick Filters:</FilterGroupTitle>
            <ToggleGrid>
              <ToggleChip
                $isActive={showDelayedOnly}
                onClick={() => onDelayedToggle(!showDelayedOnly)}
              >
                🔴 Delayed Only
              </ToggleChip>
              <ToggleChip
                $isActive={showAlertsOnly}
                onClick={() => onAlertsToggle(!showAlertsOnly)}
              >
                ⚠️ With Alerts Only
              </ToggleChip>
            </ToggleGrid>
          </FilterGroup>
        </ExpandedFilters>
      )}
    </Container>
  );
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Container = styled.div`
  background: ${({ theme }) => theme.colors.surface.canvas};
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  margin-bottom: 24px;
`;

const TopRow = styled.div`
  display: flex;
  gap: 16px;
  align-items: center;
  flex-wrap: wrap;

  @media (max-width: 768px) {
    flex-direction: column;
    align-items: stretch;
  }
`;

const SearchSection = styled.div`
  flex: 1;
  min-width: 250px;
`;

const SearchInput = styled.input`
  width: 100%;
  padding: 10px 16px;
  border: 2px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: 8px;
  font-size: 14px;
  background: ${({ theme }) => theme.colors.surface.canvas};
  color: ${({ theme }) => theme.colors.text.primary};
  transition: border-color 150ms ease-in-out;

  &:focus {
    outline: none;
    border-color: #0F6E56;
  }

  &::placeholder {
    color: ${({ theme }) => theme.colors.text.tertiary};
  }
`;

const ControlsSection = styled.div`
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
`;

const ResultsCount = styled.div`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text.secondary};
  font-weight: 500;
  white-space: nowrap;
`;

const SortControl = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
`;

const SortLabel = styled.label`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text.secondary};
  font-weight: 500;
`;

const SortSelect = styled.select`
  padding: 8px 12px;
  border: 2px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: 6px;
  font-size: 14px;
  background: ${({ theme }) => theme.colors.surface.canvas};
  color: ${({ theme }) => theme.colors.text.primary};
  cursor: pointer;
  transition: border-color 150ms ease-in-out;

  &:focus {
    outline: none;
    border-color: #0F6E56;
  }
`;

const SortDirectionButton = styled.button`
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: 6px;
  background: ${({ theme }) => theme.colors.surface.canvas};
  color: ${({ theme }) => theme.colors.text.primary};
  font-size: 16px;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    border-color: #0F6E56;
    background: ${({ theme }) => theme.colors.surface.sunken};
  }
`;

const ExpandButton = styled.button`
  padding: 8px 16px;
  border: 2px solid #0F6E56;
  border-radius: 6px;
  background: ${({ theme }) => theme.colors.surface.canvas};
  color: #0F6E56;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  position: relative;
  transition: all 150ms ease-in-out;

  &:hover {
    background: ${({ theme }) => theme.colors.surface.sunken};
  }
`;

const ActiveIndicator = styled.div`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #9E2A2A;
  position: absolute;
  top: -2px;
  right: -2px;
`;

const ClearButton = styled.button`
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  background: #9E2A2A;
  color: white;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 150ms ease-in-out;

  &:hover {
    background: #d32f2f;
  }
`;

const ExpandedFilters = styled.div`
  margin-top: 16px;
  padding-top: 16px;
  border-top: 2px solid ${({ theme }) => theme.colors.surface.raised};
`;

const FilterGroup = styled.div`
  margin-bottom: 16px;

  &:last-child {
    margin-bottom: 0;
  }
`;

const FilterGroupTitle = styled.h4`
  font-size: 12px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.secondary};
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0 0 8px 0;
`;

const ChipGrid = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`;

const StateChip = styled.button<{ $isSelected: boolean; $color: string }>`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 20px;
  border: 2px solid ${(props) => (props.$isSelected ? props.$color : props.theme.colors.border.subtle)};
  background: ${(props) => (props.$isSelected ? `${props.$color}15` : 'transparent')};
  cursor: pointer;
  transition: all 150ms ease-in-out;
  font-size: 13px;

  &:hover {
    border-color: ${(props) => props.$color};
    background: ${(props) => `${props.$color}10`};
  }
`;

const PerformanceChip = styled.button<{ $isSelected: boolean }>`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 20px;
  border: 2px solid ${(props) => (props.$isSelected ? '#0F6E56' : props.theme.colors.border.subtle)};
  background: ${(props) => (props.$isSelected ? props.theme.colors.surface.sunken : 'transparent')};
  cursor: pointer;
  transition: all 150ms ease-in-out;
  font-size: 13px;

  &:hover {
    border-color: #0F6E56;
    background: ${({ theme }) => theme.colors.surface.sunken};
  }
`;

const ChipIcon = styled.span`
  font-size: 14px;
`;

const ChipLabel = styled.span`
  font-size: 13px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text.primary};
`;

const ToggleGrid = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`;

const ToggleChip = styled.button<{ $isActive: boolean }>`
  padding: 8px 16px;
  border-radius: 6px;
  border: 2px solid ${(props) => (props.$isActive ? '#0F6E56' : props.theme.colors.border.subtle)};
  background: ${(props) => (props.$isActive ? '#0F6E56' : 'transparent')};
  color: ${(props) => (props.$isActive ? 'white' : props.theme.colors.text.primary)};
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    border-color: #0F6E56;
    background: ${(props) => (props.$isActive ? props.theme.colors.accent.sageDeep : props.theme.colors.surface.sunken)};
    color: ${(props) => (props.$isActive ? 'white' : props.theme.colors.text.primary)};
  }
`;
