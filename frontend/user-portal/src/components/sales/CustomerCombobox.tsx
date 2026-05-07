/**
 * CustomerCombobox
 *
 * A typeahead combobox that searches CRM customers via crmApi.searchCustomers().
 * Designed for use inside OrderForm. Calls onCustomerSelect when the user picks
 * a customer; the parent is responsible for updating form fields accordingly.
 *
 * Spec-compliant behaviours:
 *  - Debounced search (250 ms), minimum 2 characters to fire.
 *  - Keyboard navigation: ↓/↑ to highlight, Enter to select, Esc to close.
 *  - Click-outside closes the dropdown without selecting.
 *  - Loading spinner and empty/error states inside the dropdown.
 *  - No "Add" button — empty-state is text-only per spec.
 *  - Broken-link warning rendered below the input when brokenLink=true.
 *  - ARIA: role="combobox" + role="listbox" for screen-reader support.
 *  - In-flight request cancellation via AbortController to prevent stale results.
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useId,
} from 'react';
import styled from 'styled-components';
import { crmApi } from '../../services/crmService';
import type { Customer } from '../../types/crm';

// ============================================================================
// PROPS
// ============================================================================

export interface CustomerComboboxProps {
  /** Currently resolved customer ID (null when no selection yet). */
  valueCustomerId: string | null;
  /** Fallback display name when a saved order's CRM link is missing. */
  valueCustomerName: string;
  /** Called when the user selects a customer from the dropdown. */
  onCustomerSelect: (customer: Customer) => void;
  /** Called when the user clears the selected customer via the X button. */
  onClear: () => void;
  /** Form-validation error message forwarded from react-hook-form. */
  error?: string;
  /** Disables the input (e.g. while the form is submitting). */
  disabled?: boolean;
  /**
   * When true, renders an amber "customer no longer in CRM" warning
   * below the input showing the saved fallback name.
   */
  brokenLink?: boolean;
}

// ============================================================================
// STYLED COMPONENTS  — all transient props use the $ prefix per project rules.
// ============================================================================

const Wrapper = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const ComboInput = styled.input<{ $hasError?: boolean }>`
  padding: 12px 16px;
  border: 1px solid
    ${({ $hasError, theme }) => ($hasError ? '#EF4444' : theme.colors.neutral[300])};
  border-radius: 8px;
  font-size: 14px;
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.textPrimary};
  width: 100%;
  box-sizing: border-box;
  transition: all 150ms ease-in-out;

  &::placeholder {
    color: ${({ theme }) => theme.colors.textDisabled};
  }

  &:focus {
    outline: none;
    border-color: ${({ $hasError }) => ($hasError ? '#EF4444' : '#3B82F6')};
    box-shadow: 0 0 0 3px
      ${({ $hasError }) =>
        $hasError ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)'};
  }

  &:disabled {
    background: ${({ theme }) => theme.colors.surface};
    cursor: not-allowed;
  }
`;

/* "Chip" rendering for the selected-customer state — replaces the search input
   when a customer is locked in. Visually matches an input but is not editable;
   the X button on the right clears the selection. */
const SelectedChip = styled.div<{ $hasError?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 12px 12px 16px;
  border: 1px solid
    ${({ $hasError, theme }) => ($hasError ? '#EF4444' : theme.colors.neutral[300])};
  border-radius: 8px;
  background: ${({ theme }) => theme.colors.surface};
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  width: 100%;
  box-sizing: border-box;
  min-height: 44px;
`;

const SelectedChipName = styled.span`
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
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 16px;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: rgba(239, 68, 68, 0.1);
    color: #EF4444;
  }

  &:focus-visible {
    outline: 2px solid #EF4444;
    outline-offset: 2px;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const Dropdown = styled.ul`
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: ${({ theme }) => theme.colors.background};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  max-height: 280px;
  overflow-y: auto;
  z-index: 1100;
  list-style: none;
  margin: 0;
  padding: 4px 0;
`;

const DropdownItem = styled.li<{ $highlighted?: boolean }>`
  padding: 10px 16px;
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

const CustomerName = styled.strong`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-weight: 500;
`;

const CustomerMeta = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const DropdownState = styled.li`
  padding: 14px 16px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-align: center;
`;

const ErrorText = styled.span`
  font-size: 12px;
  color: #ef4444;
`;

const BrokenLinkWarning = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 12px;
  color: #92400e; /* amber-800 */
  background: #fef3c7; /* amber-100 */
  border: 1px solid #fcd34d; /* amber-300 */
  border-radius: 6px;
  padding: 6px 10px;
  margin-top: 2px;
`;

const Spinner = styled.span`
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid ${({ theme }) => theme.colors.neutral[300]};
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
  vertical-align: middle;
  margin-right: 6px;

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`;

// ============================================================================
// COMPONENT
// ============================================================================

export function CustomerCombobox({
  valueCustomerId,
  valueCustomerName,
  onCustomerSelect,
  onClear,
  error,
  disabled = false,
  brokenLink = false,
}: CustomerComboboxProps) {
  const listboxId = useId();

  // The text currently shown in the input (display value, not the UUID).
  const [inputValue, setInputValue] = useState<string>(valueCustomerName);
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Customer[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const [isLoading, setIsLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Track whether the current input reflects a confirmed selection so we know
  // when to treat typing as a new search vs. just displaying the saved name.
  const [isSelectionConfirmed, setIsSelectionConfirmed] = useState<boolean>(
    Boolean(valueCustomerId && valueCustomerName),
  );

  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // AbortController for the current in-flight search — lets us cancel stale requests.
  const abortControllerRef = useRef<AbortController | null>(null);

  // Keep input display in sync when parent updates the value (e.g. edit mode).
  useEffect(() => {
    setInputValue(valueCustomerName);
    setIsSelectionConfirmed(Boolean(valueCustomerId && valueCustomerName));
  }, [valueCustomerName, valueCustomerId]);

  // -------------------------------------------------------------------------
  // Close dropdown on click-outside.
  // -------------------------------------------------------------------------
  useEffect(() => {
    const handlePointerDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
        setHighlightedIndex(-1);
        // Restore the confirmed display name if the user clicked away mid-search.
        if (isSelectionConfirmed) {
          setInputValue(valueCustomerName);
        }
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isSelectionConfirmed, valueCustomerName]);

  // -------------------------------------------------------------------------
  // Debounced search trigger.
  // -------------------------------------------------------------------------
  const scheduleSearch = useCallback((query: string) => {
    if (debounceTimer.current !== null) {
      clearTimeout(debounceTimer.current);
    }

    if (query.length < 2) {
      // Abort any in-flight request — not needed any more.
      abortControllerRef.current?.abort();
      setResults([]);
      setIsLoading(false);
      setSearchError(null);
      return;
    }

    debounceTimer.current = setTimeout(() => {
      runSearch(query);
    }, 250);
  }, []);

  const runSearch = async (query: string) => {
    // Cancel any previous in-flight request before starting a new one.
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    setIsLoading(true);
    setSearchError(null);

    try {
      const customers = await crmApi.searchCustomers(query);
      // Guard: if this controller has already been aborted by a newer call, discard.
      if (abortControllerRef.current.signal.aborted) return;

      setResults(customers.slice(0, 10));
      setHighlightedIndex(-1);
    } catch (err: unknown) {
      if (abortControllerRef.current.signal.aborted) return;
      setSearchError('Search failed. Type again to retry.');
    } finally {
      if (!abortControllerRef.current.signal.aborted) {
        setIsLoading(false);
      }
    }
  };

  // -------------------------------------------------------------------------
  // Input change handler.
  // -------------------------------------------------------------------------
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);
    setIsSelectionConfirmed(false);
    setOpen(true);
    scheduleSearch(value);
  };

  // -------------------------------------------------------------------------
  // Keyboard navigation.
  // -------------------------------------------------------------------------
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
          prev < results.length - 1 ? prev + 1 : prev,
        );
        break;

      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
        break;

      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < results.length) {
          selectCustomer(results[highlightedIndex]);
        }
        break;

      case 'Escape':
        e.preventDefault();
        setOpen(false);
        setHighlightedIndex(-1);
        // Restore confirmed display name on Escape.
        if (isSelectionConfirmed) {
          setInputValue(valueCustomerName);
        }
        break;

      default:
        break;
    }
  };

  // -------------------------------------------------------------------------
  // Selection.
  // -------------------------------------------------------------------------
  const selectCustomer = (customer: Customer) => {
    setInputValue(customer.name);
    setIsSelectionConfirmed(true);
    setOpen(false);
    setHighlightedIndex(-1);
    setResults([]);
    onCustomerSelect(customer);
  };

  // -------------------------------------------------------------------------
  // Focus: show dropdown if query is already long enough.
  // -------------------------------------------------------------------------
  const handleFocus = () => {
    if (!isSelectionConfirmed && inputValue.length >= 2) {
      setOpen(true);
      scheduleSearch(inputValue);
    }
  };

  // -------------------------------------------------------------------------
  // Dropdown body content.
  // -------------------------------------------------------------------------
  const renderDropdownContent = () => {
    if (isLoading) {
      return (
        <DropdownState role="status" aria-live="polite">
          <Spinner aria-hidden="true" />
          Searching…
        </DropdownState>
      );
    }

    if (searchError) {
      return (
        <DropdownState role="alert" aria-live="assertive">
          {searchError}
        </DropdownState>
      );
    }

    if (inputValue.length < 2) {
      return (
        <DropdownState>Type at least 2 characters to search.</DropdownState>
      );
    }

    if (results.length === 0) {
      return (
        <DropdownState>
          No customers match. Open CRM to add one.
        </DropdownState>
      );
    }

    return results.map((customer, index) => (
      <DropdownItem
        key={customer.customerId}
        role="option"
        aria-selected={index === highlightedIndex}
        id={`${listboxId}-option-${index}`}
        $highlighted={index === highlightedIndex}
        onMouseDown={(e) => {
          // Use mousedown (not click) so the event fires before input blur.
          e.preventDefault();
          selectCustomer(customer);
        }}
        onMouseEnter={() => setHighlightedIndex(index)}
      >
        <CustomerName>{customer.name}</CustomerName>
        <CustomerMeta>
          {customer.customerCode ?? '—'} &middot;{' '}
          {customer.company ?? 'Individual'}
        </CustomerMeta>
      </DropdownItem>
    ));
  };

  // A customer is "locked in" when both id and name are set on the form.
  // In that state we render a read-only chip with a clear button instead of
  // the search input — there's only one customer per order, so once chosen
  // the search affordance is hidden until cleared.
  const hasSelection = Boolean(valueCustomerId && valueCustomerName);

  return (
    <Wrapper ref={wrapperRef}>
      {hasSelection ? (
        <SelectedChip $hasError={!!error} aria-label="Selected customer">
          <SelectedChipName>{valueCustomerName}</SelectedChipName>
          <ClearButton
            type="button"
            onClick={() => {
              onClear();
              // Reset internal search state so the next round starts fresh.
              setInputValue('');
              setResults([]);
              setOpen(false);
              setHighlightedIndex(-1);
              setSearchError(null);
            }}
            disabled={disabled}
            aria-label={`Clear selected customer ${valueCustomerName}`}
            title="Clear selection"
          >
            ×
          </ClearButton>
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
            aria-label="Search customer"
            autoComplete="off"
            placeholder="Type to search customers…"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={handleFocus}
            disabled={disabled}
            $hasError={!!error}
          />

          {open && (
            <Dropdown
              id={listboxId}
              role="listbox"
              aria-label="Customer search results"
            >
              {renderDropdownContent()}
            </Dropdown>
          )}
        </>
      )}

      {/* Form-validation error forwarded from parent */}
      {error && <ErrorText role="alert">{error}</ErrorText>}

      {/* Broken-link warning — only shown in edit mode when the saved
          customerId is no longer resolvable in CRM */}
      {brokenLink && (
        <BrokenLinkWarning role="alert">
          <span aria-hidden="true">&#9888;</span>
          <span>
            Customer no longer in CRM — saved name:{' '}
            <strong>{valueCustomerName || '(unknown)'}</strong>
          </span>
        </BrokenLinkWarning>
      )}
    </Wrapper>
  );
}
