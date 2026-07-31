/**
 * DashboardFilters Component
 *
 * Provides filtering and sorting controls for dashboard blocks.
 * Includes state filters, search, performance filters, and sort options.
 */

import { useState } from 'react';
import styled, { useTheme } from 'styled-components';
import {
  Square,
  ClipboardList,
  Sprout,
  Leaf,
  Grape,
  Wheat,
  Sparkles,
  Trophy,
  Target,
  Star,
  Check,
  CircleDot,
  AlertCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { glassPanel, glassControl, monoLabel, hexToRgba } from '@a64core/shared';
import type { Theme } from '@a64core/shared';
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

// Theme-aware — built inside the component via getStateOptions(theme).
// Colours trace to the phase map (spec §5.2 extrapolated vocabulary); gold
// (phase.harvesting) is used only for the literal Harvesting state (spec §3).
function getStateOptions(theme: Theme): { value: DashboardBlockStatus; label: string; icon: LucideIcon; color: string }[] {
  return [
    { value: 'empty', label: 'Empty', icon: Square, color: theme.colors.phase.empty },
    { value: 'planned', label: 'Planned', icon: ClipboardList, color: theme.colors.phase.fruitingInit },
    { value: 'planted', label: 'Planted', icon: Sprout, color: theme.colors.phase.inoculated },
    { value: 'growing', label: 'Growing', icon: Leaf, color: theme.colors.phase.colonizing },
    { value: 'fruiting', label: 'Fruiting', icon: Grape, color: theme.colors.phase.fruiting },
    { value: 'harvesting', label: 'Harvesting', icon: Wheat, color: theme.colors.phase.harvesting },
    { value: 'cleaning', label: 'Cleaning', icon: Sparkles, color: theme.colors.phase.cleaning },
  ];
}

const PERFORMANCE_OPTIONS: { value: PerformanceCategory; label: string; icon: LucideIcon }[] = [
  { value: 'exceptional', label: 'Exceptional', icon: Trophy },
  { value: 'exceeding', label: 'Exceeding', icon: Target },
  { value: 'excellent', label: 'Excellent', icon: Star },
  { value: 'good', label: 'Good', icon: Check },
  { value: 'acceptable', label: 'Acceptable', icon: CircleDot },
  { value: 'poor', label: 'Poor', icon: AlertCircle },
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
  const theme = useTheme();
  const STATE_OPTIONS = getStateOptions(theme);
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
            <SortDirectionButton onClick={onSortDirectionToggle} aria-label="Toggle sort direction">
              {sortDirection === 'asc' ? <ArrowUp size={14} strokeWidth={2} /> : <ArrowDown size={14} strokeWidth={2} />}
            </SortDirectionButton>
          </SortControl>

          <ExpandButton onClick={() => setIsExpanded(!isExpanded)}>
            {isExpanded ? <ChevronDown size={14} strokeWidth={2} /> : <ChevronRight size={14} strokeWidth={2} />} Filters
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
                  <ChipIcon as={option.icon} size={14} strokeWidth={1.8} aria-hidden="true" />
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
                  <ChipIcon as={option.icon} size={14} strokeWidth={1.8} aria-hidden="true" />
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
                <AlertCircle size={14} strokeWidth={1.8} /> Delayed Only
              </ToggleChip>
              <ToggleChip
                $isActive={showAlertsOnly}
                onClick={() => onAlertsToggle(!showAlertsOnly)}
              >
                <AlertTriangle size={14} strokeWidth={1.8} /> With Alerts Only
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
  ${glassPanel}
  padding: 16px;
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
  ${glassControl}
  width: 100%;
  padding: 10px 16px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  transition: border-color 150ms ease-in-out;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }

  &::placeholder {
    color: ${({ theme }) => theme.colors.muted};
  }
`;

const ControlsSection = styled.div`
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
`;

const ResultsCount = styled.div`
  ${monoLabel}
  font-size: 0.68rem;
  color: ${({ theme }) => theme.colors.muted};
  white-space: nowrap;
`;

const SortControl = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
`;

const SortLabel = styled.label`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.muted};
  font-weight: 500;
`;

const SortSelect = styled.select`
  ${glassControl}
  padding: 8px 12px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  cursor: pointer;
  transition: border-color 150ms ease-in-out;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
`;

const SortDirectionButton = styled.button`
  ${glassControl}
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.colors.textPrimary};
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    border-color: ${({ theme }) => theme.colors.celeste};
    background: ${({ theme }) => theme.colors.glass.hi};
  }
`;

const ExpandButton = styled.button`
  ${glassControl}
  padding: 8px 16px;
  color: ${({ theme }) => theme.colors.celeste};
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  position: relative;
  transition: all 150ms ease-in-out;

  &:hover {
    background: ${({ theme }) => theme.colors.glass.hi};
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

const ActiveIndicator = styled.div`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${({ theme }) => theme.colors.bright.coral};
  box-shadow: 0 0 6px ${({ theme }) => theme.colors.bright.coral};
  position: absolute;
  top: -2px;
  right: -2px;
`;

const ClearButton = styled.button`
  padding: 8px 16px;
  border: 1px solid rgba(240, 138, 112, 0.4);
  border-radius: 10px;
  background: rgba(240, 138, 112, 0.14);
  color: ${({ theme }) => theme.colors.bright.coral};
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: background 150ms ease-in-out;

  &:hover {
    background: rgba(240, 138, 112, 0.26);
  }
`;

const ExpandedFilters = styled.div`
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid ${({ theme }) => theme.colors.line};
`;

const FilterGroup = styled.div`
  margin-bottom: 16px;

  &:last-child {
    margin-bottom: 0;
  }
`;

const FilterGroupTitle = styled.h4`
  ${monoLabel}
  font-size: 0.62rem;
  color: ${({ theme }) => theme.colors.muted};
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
  border-radius: 99px;
  border: 1px solid ${(props) => (props.$isSelected ? props.$color : props.theme.colors.glass.border)};
  background: ${(props) => (props.$isSelected ? hexToRgba(props.$color, 0.16) : 'rgba(23, 29, 64, 0.35)')};
  color: ${(props) => (props.$isSelected ? props.$color : props.theme.colors.muted)};
  cursor: pointer;
  transition: all 150ms ease-in-out;
  font-size: 13px;

  &:hover {
    border-color: ${(props) => props.$color};
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

const PerformanceChip = styled.button<{ $isSelected: boolean }>`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 99px;
  border: 1px solid ${(props) => (props.$isSelected ? props.theme.colors.celeste : props.theme.colors.glass.border)};
  background: ${(props) => (props.$isSelected ? 'rgba(180, 200, 220, 0.14)' : 'rgba(23, 29, 64, 0.35)')};
  color: ${(props) => (props.$isSelected ? props.theme.colors.textPrimary : props.theme.colors.muted)};
  cursor: pointer;
  transition: all 150ms ease-in-out;
  font-size: 13px;

  &:hover {
    border-color: ${({ theme }) => theme.colors.celeste};
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

const ChipIcon = styled.span`
  display: inline-flex;
`;

const ChipLabel = styled.span`
  font-size: 13px;
  font-weight: 600;
`;

const ToggleGrid = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`;

// Toggle "on" state uses celeste, not gold — these are ordinary filter
// toggles, not the view's primary CTA (spec §3).
const ToggleChip = styled.button<{ $isActive: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 10px;
  border: 1px solid ${(props) => (props.$isActive ? props.theme.colors.celeste : props.theme.colors.glass.border)};
  background: ${(props) => (props.$isActive ? 'rgba(180, 200, 220, 0.14)' : 'transparent')};
  color: ${(props) => (props.$isActive ? props.theme.colors.textPrimary : props.theme.colors.muted)};
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    border-color: ${({ theme }) => theme.colors.celeste};
    background: rgba(180, 200, 220, 0.14);
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;
