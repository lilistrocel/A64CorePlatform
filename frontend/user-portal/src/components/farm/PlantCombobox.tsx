/**
 * PlantCombobox — data-driven typeahead combobox for selecting a crop/plant.
 *
 * Mirrors SalesItemCombobox interaction pattern exactly:
 *  - Unselected: search input with typeahead dropdown (all or filtered results).
 *  - Selected: read-only chip with an X clear button.
 *  - Keyboard: ↓/↑ navigate, Enter selects, Escape closes.
 *  - Click-outside closes (including the portaled panel).
 *  - ARIA: role="combobox" / role="listbox" / role="option".
 *  - Dropdown portaled to document.body via createPortal + getBoundingClientRect
 *    so it escapes the modal's overflow:hidden.
 *  - Flip-above logic when insufficient space below the trigger.
 *
 * KEY DIFFERENCE from SalesItemCombobox: this component is DATA-DRIVEN BY PROPS
 * and does NOT call any data hook.  The parent already holds the plant list.
 *
 * Styled-components: all transient props use the $ prefix (project rule, UI-Standards.md).
 */

import {
  useState,
  useEffect,
  useRef,
  useId,
  useLayoutEffect,
  useCallback,
} from 'react';
import { createPortal } from 'react-dom';
import styled from 'styled-components';
import type { PlantDataEnhanced } from '../../types/farm';

// ─── Public interface ─────────────────────────────────────────────────────────

export interface PlantComboboxProps {
  /** Full list of plants (already loaded by the parent). */
  plants: PlantDataEnhanced[];
  /** Currently selected plantDataId, or '' for unselected. */
  value: string;
  /** Called with the chosen plantDataId, or '' when the user clears. */
  onChange: (plantDataId: string) => void;
  /** Placeholder shown in the search input. */
  placeholder?: string;
  /** Renders a red border — mirrors the form's validation error state. */
  hasError?: boolean;
  /** Pass-through disabled state. */
  disabled?: boolean;
}

// ─── Styled components ────────────────────────────────────────────────────────
// All transient props use the $ prefix per project rules (UI-Standards.md).

const Wrapper = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const ComboInput = styled.input<{ $hasError?: boolean }>`
  padding: 7px 8px;
  border: 1px solid
    ${({ $hasError, theme }) => ($hasError ? '#EF4444' : theme.colors.neutral[300])};
  border-radius: 6px;
  font-size: 13px;
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.textPrimary};
  width: 100%;
  box-sizing: border-box;
  transition: border-color 150ms ease-in-out, box-shadow 150ms ease-in-out;

  &::placeholder {
    color: ${({ theme }) => theme.colors.textDisabled};
  }

  &:focus {
    outline: none;
    border-color: ${({ $hasError }) => ($hasError ? '#EF4444' : '#3B82F6')};
    box-shadow: 0 0 0 2px
      ${({ $hasError }) =>
        $hasError ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)'};
  }

  &:disabled {
    background: ${({ theme }) => theme.colors.surface};
    cursor: not-allowed;
    opacity: 0.7;
  }
`;

/** Read-only chip shown when a plant is selected. */
const SelectedChip = styled.div<{ $hasError?: boolean; $disabled?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px 6px 10px;
  border: 1px solid
    ${({ $hasError, theme }) => ($hasError ? '#EF4444' : theme.colors.neutral[300])};
  border-radius: 6px;
  background: ${({ $disabled, theme }) =>
    $disabled ? theme.colors.surface : (theme.colors.primary as Record<string, string>)['50'] ?? '#EFF6FF'};
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textPrimary};
  width: 100%;
  box-sizing: border-box;
  min-height: 32px;
  opacity: ${({ $disabled }) => ($disabled ? 0.85 : 1)};
`;

const ChipLabel = styled.span`
  font-weight: 500;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const ClearButton = styled.button`
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  transition: background 120ms ease-in-out, color 120ms ease-in-out;

  &:hover {
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
  }

  &:focus-visible {
    outline: 2px solid #ef4444;
    outline-offset: 2px;
  }
`;

/**
 * DropdownPanel — portaled to document.body via createPortal.
 * Fixed positioning escapes any overflow:hidden ancestor (e.g. the modal scroll container).
 */
interface DropdownPanelStyle {
  top: number;
  left: number;
  width: number;
  /** Set when the panel flips above the trigger. */
  bottom?: number;
}

const Dropdown = styled.ul<{ $style: DropdownPanelStyle }>`
  position: fixed;
  top: ${({ $style }) => ($style.bottom !== undefined ? 'auto' : `${$style.top}px`)};
  bottom: ${({ $style }) =>
    $style.bottom !== undefined ? `${$style.bottom}px` : 'auto'};
  left: ${({ $style }) => `${$style.left}px`};
  width: ${({ $style }) => `${$style.width}px`};
  background: ${({ theme }) => theme.colors.background};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  max-height: 260px;
  overflow-y: auto;
  z-index: 9999;
  list-style: none;
  margin: 0;
  padding: 4px 0;
`;

const DropdownItem = styled.li<{ $highlighted?: boolean }>`
  padding: 8px 12px;
  cursor: pointer;
  background: ${({ $highlighted, theme }) =>
    $highlighted ? theme.colors.surface : 'transparent'};
  display: flex;
  flex-direction: column;
  gap: 2px;
  transition: background 80ms ease-in-out;

  &:hover {
    background: ${({ theme }) => theme.colors.surface};
  }
`;

/** Primary line: plant name in bold (mirrors ItemCode in SalesItemCombobox). */
const PlantName = styled.strong`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-weight: 600;
`;

/** Secondary muted line: cycle days + yield info. */
const PlantMeta = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const DropdownState = styled.li`
  padding: 12px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-align: center;
`;

// ─── Component ────────────────────────────────────────────────────────────────

const MAX_DISPLAY = 20;

export function PlantCombobox({
  plants,
  value,
  onChange,
  placeholder = 'Type to search crops…',
  hasError = false,
  disabled = false,
}: PlantComboboxProps) {
  const listboxId = useId();

  // ── Internal state ──────────────────────────────────────────────────────────
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Portal panel positioning ────────────────────────────────────────────────
  const [panelStyle, setPanelStyle] = useState<DropdownPanelStyle>({
    top: 0,
    left: 0,
    width: 200,
  });

  const recalcPosition = useCallback(() => {
    const trigger = wrapperRef.current;
    if (!trigger || !open) return;

    const rect = trigger.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const DROPDOWN_MAX_HEIGHT = 260;
    const GAP = 4;

    const spaceBelow = viewportHeight - rect.bottom - GAP;
    const spaceAbove = rect.top - GAP;

    if (spaceBelow >= DROPDOWN_MAX_HEIGHT || spaceBelow >= spaceAbove) {
      // Open below the trigger.
      setPanelStyle({
        top: rect.bottom + GAP,
        left: rect.left,
        width: rect.width,
      });
    } else {
      // Flip above the trigger when insufficient space below.
      setPanelStyle({
        top: 0,
        left: rect.left,
        width: rect.width,
        bottom: viewportHeight - rect.top + GAP,
      });
    }
  }, [open]);

  // ── Derived: filtered plants ────────────────────────────────────────────────
  const filtered =
    query.trim().length === 0
      ? plants
      : plants.filter((p) =>
          p.plantName.toLowerCase().includes(query.toLowerCase()),
        );

  const displayItems = filtered.slice(0, MAX_DISPLAY);

  // ── Resolve selected plant for chip display ─────────────────────────────────
  const selectedPlant = value
    ? plants.find((p) => p.plantDataId === value) ?? null
    : null;

  // ── Recalculate position when dropdown opens/closes ─────────────────────────
  useLayoutEffect(() => {
    recalcPosition();
  }, [open, recalcPosition]);

  // ── Reposition on scroll / resize while open ────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handleScrollOrResize = () => recalcPosition();
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [open, recalcPosition]);

  // ── Click-outside — must also cover the portaled dropdown panel ─────────────
  useEffect(() => {
    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideWrapper = wrapperRef.current?.contains(target) ?? false;
      const portalEl = document.getElementById(listboxId);
      const insidePortal = portalEl?.contains(target) ?? false;

      if (!insideWrapper && !insidePortal) {
        setOpen(false);
        setHighlightedIndex(-1);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [listboxId]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setOpen(true);
    setHighlightedIndex(-1);
  };

  const handleFocus = () => {
    setOpen(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        setOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < displayItems.length - 1 ? prev + 1 : prev,
        );
        break;

      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
        break;

      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < displayItems.length) {
          selectPlant(displayItems[highlightedIndex]);
        }
        break;

      case 'Escape':
        e.preventDefault();
        setOpen(false);
        setHighlightedIndex(-1);
        setQuery('');
        break;

      default:
        break;
    }
  };

  const selectPlant = (plant: PlantDataEnhanced) => {
    setOpen(false);
    setHighlightedIndex(-1);
    setQuery('');
    onChange(plant.plantDataId);
  };

  const handleClear = () => {
    setQuery('');
    setOpen(false);
    setHighlightedIndex(-1);
    onChange('');
  };

  // ── Dropdown content ─────────────────────────────────────────────────────────

  const renderDropdownContent = () => {
    if (plants.length === 0) {
      return <DropdownState>No plant data available.</DropdownState>;
    }

    if (displayItems.length === 0) {
      return <DropdownState>No crops match "{query}".</DropdownState>;
    }

    return displayItems.map((plant, index) => (
      <DropdownItem
        key={plant.plantDataId}
        role="option"
        aria-selected={index === highlightedIndex}
        id={`${listboxId}-option-${index}`}
        $highlighted={index === highlightedIndex}
        onMouseDown={(e) => {
          // mousedown fires before input blur, preventing the dropdown from
          // closing before the click registers.
          e.preventDefault();
          selectPlant(plant);
        }}
        onMouseEnter={() => setHighlightedIndex(index)}
      >
        <PlantName>{plant.plantName}</PlantName>
        <PlantMeta>
          {plant.growthCycle.totalCycleDays} days cycle &middot;{' '}
          {plant.yieldInfo.yieldPerPlant}
          {plant.yieldInfo.yieldUnit}/plant
        </PlantMeta>
      </DropdownItem>
    ));
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  const hasSelection = Boolean(value);

  return (
    <Wrapper ref={wrapperRef}>
      {hasSelection ? (
        // Chip state: display selected plant name; X button clears (hidden when disabled).
        <SelectedChip
          $hasError={hasError}
          $disabled={disabled}
          aria-label="Selected crop"
        >
          <ChipLabel title={selectedPlant?.plantName ?? value}>
            {selectedPlant?.plantName ?? value}
          </ChipLabel>
          {!disabled && (
            <ClearButton
              type="button"
              onClick={handleClear}
              aria-label={`Clear selected crop ${selectedPlant?.plantName ?? ''}`}
              title="Clear selection"
            >
              ×
            </ClearButton>
          )}
        </SelectedChip>
      ) : (
        <>
          <ComboInput
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls={open ? listboxId : undefined}
            aria-activedescendant={
              open && highlightedIndex >= 0
                ? `${listboxId}-option-${highlightedIndex}`
                : undefined
            }
            aria-autocomplete="list"
            aria-label="Search crop"
            autoComplete="off"
            placeholder={placeholder}
            value={query}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={handleFocus}
            disabled={disabled}
            $hasError={hasError}
          />

          {open &&
            createPortal(
              <Dropdown
                id={listboxId}
                role="listbox"
                aria-label="Crop search results"
                $style={panelStyle}
              >
                {renderDropdownContent()}
              </Dropdown>,
              document.body,
            )}
        </>
      )}
    </Wrapper>
  );
}
