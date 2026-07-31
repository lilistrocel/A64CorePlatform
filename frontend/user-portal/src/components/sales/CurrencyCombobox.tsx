/**
 * CurrencyCombobox — T-201.3
 *
 * A constrained dropdown for selecting an ISO 4217 currency code.
 * No backend master; uses a hardcoded list of GCC + common currencies.
 *
 * The tenant's base currency (from useFinanceCompanies → first row's defaultCurrency)
 * appears at the top with a "Base" badge. Remaining currencies follow in alphabetical order.
 *
 * Props follow the same convention as CustomerCombobox / SalesItemCombobox:
 *  - Public props use readable names (no $ prefix)
 *  - Styled-component transient props use the $ prefix (UI-Standards.md)
 *
 * Behaviour:
 *  - Click the trigger to open; click a row or press Enter to select.
 *  - Esc or click-outside closes without changing the value.
 *  - Keyboard: ↓/↑ to navigate, Enter to select, Esc to close.
 *  - ARIA: role="combobox" + role="listbox" for screen-reader support.
 */

import {
  useState,
  useRef,
  useEffect,
  useId,
} from 'react';
import styled from 'styled-components';
import { ChevronDown } from 'lucide-react';
import { glassControl, glassOpaque, monoLabel } from '@a64core/shared';
import { useTenantBaseCurrency } from '../../hooks/queries/useTenantBaseCurrency';

// ─── Currency data ──────────────────────────────────────────────────────────────

/** Full set of supported currencies (GCC + common internationals). */
const SUPPORTED_CURRENCIES = [
  'AED', 'BHD', 'EUR', 'GBP', 'INR', 'KWD', 'OMR', 'PKR', 'QAR', 'SAR', 'USD',
] as const;

type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

const CURRENCY_LABELS: Record<SupportedCurrency, string> = {
  AED: 'UAE Dirham',
  BHD: 'Bahraini Dinar',
  EUR: 'Euro',
  GBP: 'British Pound',
  INR: 'Indian Rupee',
  KWD: 'Kuwaiti Dinar',
  OMR: 'Omani Rial',
  PKR: 'Pakistani Rupee',
  QAR: 'Qatari Riyal',
  SAR: 'Saudi Riyal',
  USD: 'US Dollar',
};

// ─── Props ──────────────────────────────────────────────────────────────────────

export interface CurrencyComboboxProps {
  /** Currently selected ISO 4217 code, e.g. "AED". */
  value: string;
  /** Called when the user picks a currency. Passes the 3-letter code. */
  onChange: (code: string) => void;
  /** Disables the control (e.g. when the form is submitting or locked). */
  disabled?: boolean;
  /** Error state — renders a red border. */
  hasError?: boolean;
  /** aria-describedby forwarded to the trigger button. */
  describedBy?: string;
}

// ─── Styled components ────────────────────────────────────────────────────────
// All transient props use the $ prefix per project rules (UI-Standards.md).

const Wrapper = styled.div`
  position: relative;
`;

const TriggerButton = styled.button<{ $hasError?: boolean; $disabled?: boolean }>`
  ${glassControl}
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border-color: ${({ $hasError, theme }) =>
    $hasError ? 'rgba(240, 138, 112, 0.45)' : theme.colors.glass.border};
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  width: 100%;
  text-align: left;
  cursor: ${({ $disabled }) => ($disabled ? 'not-allowed' : 'pointer')};
  opacity: ${({ $disabled }) => ($disabled ? 0.7 : 1)};
  transition: border-color 150ms ease-in-out, box-shadow 150ms ease-in-out;

  &:focus {
    outline: none;
    border-color: ${({ $hasError, theme }) => ($hasError ? theme.colors.bright.coral : theme.colors.secondary[500])};
    box-shadow: 0 0 0 3px
      ${({ $hasError }) =>
        $hasError ? 'rgba(240, 138, 112, 0.15)' : 'rgba(220, 185, 79, 0.15)'};
  }
`;

const TriggerContent = styled.span`
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
`;

const CodeBadge = styled.span`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-weight: 700;
  font-size: 14px;
  letter-spacing: 0.3px;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const CurrencyLabel = styled.span`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.muted};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const ChevronIcon = styled(ChevronDown)<{ $open: boolean }>`
  flex-shrink: 0;
  color: ${({ theme }) => theme.colors.celeste};
  transition: transform 150ms ease-in-out;
  transform: ${({ $open }) => ($open ? 'rotate(180deg)' : 'rotate(0deg)')};
`;

/* Dropdown/menu popup — glassOpaque (cosmos-hi, no blur). The "opaque menu
   popping out of a glass panel" pattern keeps this under the spec §2
   two-glass-layer limit when the combobox itself sits inside a glassPanel. */
const Dropdown = styled.ul`
  ${glassOpaque}
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  border-radius: 8px;
  max-height: 280px;
  overflow-y: auto;
  z-index: 1200;
  list-style: none;
  margin: 0;
  padding: 4px 0;
`;

const SectionDivider = styled.li`
  ${monoLabel}
  padding: 4px 12px 2px;
  color: ${({ theme }) => theme.colors.muted};
  user-select: none;

  & + & {
    margin-top: 4px;
    border-top: 1px solid ${({ theme }) => theme.colors.line};
    padding-top: 8px;
  }
`;

/* Selected/highlighted item — subtle neutral tint, never gold (gold is
   reserved — spec §3). */
const CurrencyItem = styled.li<{ $highlighted?: boolean; $isBase?: boolean }>`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  cursor: pointer;
  background: ${({ $highlighted }) =>
    $highlighted ? 'rgba(180, 200, 220, 0.07)' : 'transparent'};
  transition: background 80ms ease-in-out;

  &:hover {
    background: rgba(180, 200, 220, 0.07);
  }
`;

const ItemCode = styled.span`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-weight: 700;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textPrimary};
  min-width: 36px;
`;

const ItemName = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.muted};
  flex: 1;
`;

const BaseBadge = styled.span`
  ${monoLabel}
  display: inline-block;
  padding: 1px 6px;
  border-radius: 10px;
  background: ${({ theme }) => theme.colors.infoBg};
  color: ${({ theme }) => theme.colors.bright.lapis};
  flex-shrink: 0;
`;

// ─── Component ─────────────────────────────────────────────────────────────────

export function CurrencyCombobox({
  value,
  onChange,
  disabled = false,
  hasError = false,
  describedBy,
}: CurrencyComboboxProps) {
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const baseCurrency = useTenantBaseCurrency();

  // Build ordered list: base currency first, then remaining currencies alphabetically.
  const otherCurrencies = SUPPORTED_CURRENCIES.filter((c) => c !== baseCurrency).sort();
  const orderedCurrencies = [baseCurrency as SupportedCurrency, ...otherCurrencies];

  // If the currently-selected value is not in our list, add it for display.
  const displayValue = value || baseCurrency;
  const displayLabel =
    CURRENCY_LABELS[displayValue as SupportedCurrency] ?? displayValue;

  // ── Click-outside handler ──────────────────────────────────────────────────
  useEffect(() => {
    const handlePointerDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
        setHighlightedIndex(-1);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleTriggerClick = () => {
    if (disabled) return;
    const newOpen = !open;
    setOpen(newOpen);
    if (newOpen) {
      // Pre-select the currently active item.
      const idx = orderedCurrencies.indexOf(displayValue as SupportedCurrency);
      setHighlightedIndex(idx >= 0 ? idx : 0);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;

    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (!open) {
          setOpen(true);
          const idx = orderedCurrencies.indexOf(displayValue as SupportedCurrency);
          setHighlightedIndex(idx >= 0 ? idx : 0);
        } else if (highlightedIndex >= 0) {
          selectCurrency(orderedCurrencies[highlightedIndex]);
        }
        break;

      case 'ArrowDown':
        e.preventDefault();
        if (!open) {
          setOpen(true);
          setHighlightedIndex(0);
        } else {
          setHighlightedIndex((prev) =>
            prev < orderedCurrencies.length - 1 ? prev + 1 : prev,
          );
        }
        break;

      case 'ArrowUp':
        e.preventDefault();
        if (open) {
          setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
        }
        break;

      case 'Escape':
        e.preventDefault();
        setOpen(false);
        setHighlightedIndex(-1);
        break;

      default:
        break;
    }
  };

  const selectCurrency = (code: SupportedCurrency) => {
    onChange(code);
    setOpen(false);
    setHighlightedIndex(-1);
    triggerRef.current?.focus();
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Wrapper ref={wrapperRef}>
      <TriggerButton
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={
          open && highlightedIndex >= 0
            ? `${listboxId}-option-${highlightedIndex}`
            : undefined
        }
        aria-haspopup="listbox"
        aria-label={`Currency: ${displayValue}`}
        aria-describedby={describedBy}
        $hasError={hasError}
        $disabled={disabled}
        disabled={disabled}
        onClick={handleTriggerClick}
        onKeyDown={handleKeyDown}
      >
        <TriggerContent>
          <CodeBadge>{displayValue}</CodeBadge>
          <CurrencyLabel>{displayLabel}</CurrencyLabel>
        </TriggerContent>
        <ChevronIcon size={16} $open={open} aria-hidden="true" />
      </TriggerButton>

      {open && (
        <Dropdown id={listboxId} role="listbox" aria-label="Select currency">
          {/* Base currency section */}
          <SectionDivider aria-hidden="true">Base — recommended</SectionDivider>
          <CurrencyItem
            key={baseCurrency}
            id={`${listboxId}-option-0`}
            role="option"
            aria-selected={displayValue === baseCurrency}
            $highlighted={highlightedIndex === 0}
            $isBase
            onMouseDown={(e) => {
              e.preventDefault();
              selectCurrency(baseCurrency as SupportedCurrency);
            }}
            onMouseEnter={() => setHighlightedIndex(0)}
          >
            <ItemCode>{baseCurrency}</ItemCode>
            <ItemName>{CURRENCY_LABELS[baseCurrency as SupportedCurrency] ?? baseCurrency}</ItemName>
            <BaseBadge>Base</BaseBadge>
          </CurrencyItem>

          {/* Other currencies */}
          {otherCurrencies.length > 0 && (
            <SectionDivider aria-hidden="true">Other currencies</SectionDivider>
          )}
          {otherCurrencies.map((code, i) => {
            const globalIndex = i + 1; // +1 because base is index 0
            return (
              <CurrencyItem
                key={code}
                id={`${listboxId}-option-${globalIndex}`}
                role="option"
                aria-selected={displayValue === code}
                $highlighted={highlightedIndex === globalIndex}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectCurrency(code as SupportedCurrency);
                }}
                onMouseEnter={() => setHighlightedIndex(globalIndex)}
              >
                <ItemCode>{code}</ItemCode>
                <ItemName>{CURRENCY_LABELS[code as SupportedCurrency] ?? code}</ItemName>
              </CurrencyItem>
            );
          })}
        </Dropdown>
      )}
    </Wrapper>
  );
}
