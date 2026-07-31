/**
 * CostCenterCombobox
 *
 * Searchable typeahead picker for cost centres. Used on the Manual JE form.
 * Always optional — the first option is "— None —" which maps to null.
 *
 * Behaviour:
 *  - Filters the passed `costCenters` list by name (case-insensitive substring).
 *  - "— None —" always appears as the first option when the dropdown is open.
 *  - Keyboard: ArrowUp/Down navigate, Enter selects, Escape closes.
 *  - WAI-ARIA combobox pattern.
 *
 * Props:
 *  - costCenters  — flat list of CostCenter objects (active only, caller filters)
 *  - value        — currently selected costCenterId or null for "None"
 *  - onChange     — called with the selected costCenterId or null
 *  - id           — forwarded to the underlying <input> for label association
 *  - disabled     — disables the input when true
 */

import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from 'react';
import styled from 'styled-components';
import { glassControl, glassOpaque, monoLabel } from '@a64core/shared';
import type { CostCenter } from '../../../services/costCentersService';

// ─── Styled components ────────────────────────────────────────────────────────

const Wrapper = styled.div`
  position: relative;
  width: 100%;
`;

const ComboInput = styled.input`
  ${glassControl}
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  font-size: 13px;
  font-family: inherit;
  color: ${({ theme }) => theme.colors.textPrimary};
  transition: border-color 150ms ease;

  &::placeholder {
    color: ${({ theme }) => theme.colors.muted};
  }

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const Dropdown = styled.ul`
  ${glassOpaque}
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 1200;
  border-radius: 8px;
  max-height: 220px;
  overflow-y: auto;
  margin: 0;
  padding: 4px 0;
  list-style: none;
`;

const DropdownItem = styled.li<{ $highlighted: boolean; $isNone?: boolean }>`
  padding: 8px 12px;
  cursor: pointer;
  background: ${({ $highlighted }) => ($highlighted ? 'rgba(180, 200, 220, 0.08)' : 'transparent')};
  color: ${({ $isNone, theme }) => ($isNone ? theme.colors.muted : theme.colors.textPrimary)};
  font-size: 13px;
  font-style: ${({ $isNone }) => ($isNone ? 'italic' : 'normal')};

  &:hover {
    background: rgba(180, 200, 220, 0.08);
  }
`;

const TypeTag = styled.span`
  ${monoLabel}
  margin-left: 8px;
  font-size: 10px;
  color: ${({ theme }) => theme.colors.celeste};
`;

const EmptyMessage = styled.li`
  padding: 10px 12px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.celeste};
  list-style: none;
`;

// ─── Constants ────────────────────────────────────────────────────────────────

const NONE_OPTION_LABEL = '— None —';
const MAX_OPTIONS = 50;

// ─── Props ────────────────────────────────────────────────────────────────────

export interface CostCenterComboboxProps {
  costCenters: CostCenter[];
  value: string | null;
  onChange: (costCenterId: string | null) => void;
  id?: string;
  disabled?: boolean;
  placeholder?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CostCenterCombobox({
  costCenters,
  value,
  onChange,
  id,
  disabled = false,
  placeholder = 'Cost centre (optional)',
}: CostCenterComboboxProps) {
  const [inputText, setInputText] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  // 0 = None, 1..N = costCenters index + 1
  const [highlightIndex, setHighlightIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Sync display text when value prop changes
  useEffect(() => {
    if (value === null || value === '') {
      setInputText('');
      return;
    }
    const found = costCenters.find((cc) => cc.costCenterId === value);
    if (found) setInputText(found.name);
  }, [value, costCenters]);

  const filteredCostCenters = costCenters
    .filter((cc) => cc.isActive && cc.name.toLowerCase().includes(inputText.toLowerCase()))
    .slice(0, MAX_OPTIONS);

  // Total options: [None, ...filtered]
  const totalOptions = filteredCostCenters.length + 1;

  useEffect(() => {
    if (!listRef.current) return;
    const items = listRef.current.querySelectorAll<HTMLLIElement>('[role="option"]');
    const item = items[highlightIndex];
    if (item) item.scrollIntoView({ block: 'nearest' });
  }, [highlightIndex]);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        handleBlurClose();
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  });

  const handleBlurClose = useCallback(() => {
    setIsOpen(false);
    if (value) {
      const found = costCenters.find((cc) => cc.costCenterId === value);
      setInputText(found ? found.name : '');
    } else {
      setInputText('');
    }
  }, [value, costCenters]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
    setIsOpen(true);
    setHighlightIndex(0);
    if (value) onChange(null);
  };

  const handleSelectNone = () => {
    onChange(null);
    setInputText('');
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const handleSelectCC = (cc: CostCenter) => {
    onChange(cc.costCenterId);
    setInputText(cc.name);
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightIndex((i) => Math.min(i + 1, totalOptions - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightIndex === 0) {
          handleSelectNone();
        } else {
          const cc = filteredCostCenters[highlightIndex - 1];
          if (cc) handleSelectCC(cc);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        break;
      case 'Tab':
        setIsOpen(false);
        break;
    }
  };

  const listboxId = id ? `${id}-listbox` : undefined;
  const activeDescendantId =
    isOpen ? `${id ?? 'cc'}-opt-${highlightIndex}` : undefined;

  return (
    <Wrapper ref={wrapperRef}>
      <ComboInput
        ref={inputRef}
        id={id}
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-activedescendant={activeDescendantId}
        value={inputText}
        onChange={handleInputChange}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
      />
      {isOpen && (
        <Dropdown
          ref={listRef}
          role="listbox"
          id={listboxId}
          aria-label="Cost centres"
        >
          {/* Always-first None option */}
          <DropdownItem
            id={`${id ?? 'cc'}-opt-0`}
            role="option"
            aria-selected={value === null}
            $highlighted={highlightIndex === 0}
            $isNone
            onMouseDown={(e) => {
              e.preventDefault();
              handleSelectNone();
            }}
            onMouseEnter={() => setHighlightIndex(0)}
          >
            {NONE_OPTION_LABEL}
          </DropdownItem>

          {filteredCostCenters.length === 0 && inputText !== '' ? (
            <EmptyMessage>No cost centres match your search</EmptyMessage>
          ) : (
            filteredCostCenters.map((cc, idx) => (
              <DropdownItem
                key={cc.costCenterId}
                id={`${id ?? 'cc'}-opt-${idx + 1}`}
                role="option"
                aria-selected={cc.costCenterId === value}
                $highlighted={highlightIndex === idx + 1}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelectCC(cc);
                }}
                onMouseEnter={() => setHighlightIndex(idx + 1)}
              >
                {cc.name}
                <TypeTag>{cc.type}</TypeTag>
              </DropdownItem>
            ))
          )}
        </Dropdown>
      )}
    </Wrapper>
  );
}
