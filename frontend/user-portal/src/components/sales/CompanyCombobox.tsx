/**
 * CompanyCombobox — T-201.1
 *
 * A four-state picker for the companyCode field on sales create forms.
 *
 * LAYOUT STRATEGY (single-company visible-but-locked, decided 2026-06-04):
 *   The component renders the field in every state — single-company orgs see
 *   a disabled select showing their one company so the user has visible
 *   confirmation that the auto-filled value is correct. This was a deliberate
 *   reversal of the earlier hide-when-single approach; users reported the
 *   silent auto-fill was opaque ("am I sure it's set?").
 *
 *   `shouldShowCompanyField` is still exported for backward compatibility but
 *   now returns true unconditionally. Callers should leave their conditional
 *   wrappers in place; they're effectively no-ops now and can be removed
 *   in a future cleanup pass.
 *
 * STATES:
 *   - loading          → disabled select with placeholder "Loading companies…"
 *   - single company   → disabled select showing the single "CODE — Legal Name"
 *                        with help text "Auto-selected (only company on this tenant)"
 *   - multi company    → native <select> showing all "CODE — Legal Name" options
 *   - zero companies   → disabled select with "No companies configured" note
 *
 * ARIA:
 *   Uses a native <select> — no ARIA role override needed. Applies
 *   aria-invalid and aria-describedby for error/help associations.
 *
 * PROPS (public interface — no $ prefix; styled internals use $ prefix):
 *   value        current companyCode string in the form state
 *   onChange     called with the new companyCode string on selection
 *   orgId        forwarded to useCompanies; query disabled when falsy
 *   disabled     locks the control (e.g. from-delivery mode)
 *   hasError     renders a red border
 *   describedBy  aria-describedby forwarded to the select
 */

import { useEffect } from 'react';
import styled from 'styled-components';
import { glassControl } from '@a64core/shared';
import { useCompanies } from '../../hooks/queries/useCompanies';
import type { Company } from '../../services/companiesService';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface CompanyComboboxProps {
  /** Currently selected company code, e.g. "A001". */
  value: string;
  /** Called when the user picks a company. Passes the companyCode string. */
  onChange: (companyCode: string) => void;
  /** Organisation UUID — forwarded to useCompanies. */
  orgId: string | null | undefined;
  /** Locks the control (e.g. from-delivery mode pre-fills the value). */
  disabled?: boolean;
  /** Error state — renders a red border. */
  hasError?: boolean;
  /** aria-describedby value forwarded to the select element. */
  describedBy?: string;
}

// ─── Visibility helper ────────────────────────────────────────────────────────

/**
 * Returns true when the company field (including its label and wrapper) should
 * be rendered at all. Callers wrap the entire FieldGroup in a conditional using
 * this helper so there is no orphan label when the org has exactly one company.
 *
 * Pass `isLoading` from useCompanies to keep the field visible while the query
 * is still in flight (prevents layout shift).
 *
 * Usage:
 *   const { data: companies = [], isLoading: companiesLoading } = useCompanies(orgId);
 *   const showCompanyField = shouldShowCompanyField(companies, companiesLoading);
 *   ...
 *   {showCompanyField && (
 *     <FieldGroup>
 *       <Label>Company Code *</Label>
 *       <CompanyCombobox ... />
 *     </FieldGroup>
 *   )}
 */
export function shouldShowCompanyField(
  _companies: Company[],
  _isLoading: boolean,
): boolean {
  // Always show — see component header for the 2026-06-04 visibility reversal.
  // Helper kept for backward compatibility with existing form-page wrappers.
  return true;
}

// ─── Styled components ────────────────────────────────────────────────────────
// All transient props use the $ prefix per UI-Standards.md.

const StyledSelect = styled.select<{ $hasError?: boolean; $disabled?: boolean }>`
  ${glassControl}
  display: block;
  width: 100%;
  padding: 8px 12px;
  font-size: 14px;
  border-color: ${({ $hasError, theme }) =>
    $hasError ? 'rgba(240, 138, 112, 0.45)' : theme.colors.glass.border};
  color: ${({ $disabled, theme }) =>
    $disabled ? theme.colors.muted : theme.colors.textPrimary};
  cursor: ${({ $disabled }) => ($disabled ? 'not-allowed' : 'pointer')};
  opacity: ${({ $disabled }) => ($disabled ? 0.7 : 1)};
  transition: border-color 150ms ease-in-out, box-shadow 150ms ease-in-out;
  /* Remove browser-default outline and replace with themed focus ring */
  outline: none;

  &:focus {
    border-color: ${({ $hasError, theme }) => ($hasError ? theme.colors.bright.coral : theme.colors.secondary[500])};
    box-shadow: 0 0 0 3px
      ${({ $hasError }) =>
        $hasError ? 'rgba(240, 138, 112, 0.15)' : 'rgba(220, 185, 79, 0.15)'};
  }
`;

const HelpText = styled.span`
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.muted};
`;

const HelpLink = styled.a`
  color: ${({ theme }) => theme.colors.celeste};
  text-decoration: underline;
  cursor: pointer;

  &:hover {
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

// ─── Component ────────────────────────────────────────────────────────────────

export function CompanyCombobox({
  value,
  onChange,
  orgId,
  disabled = false,
  hasError = false,
  describedBy,
}: CompanyComboboxProps) {
  const { data: companies = [], isLoading } = useCompanies(orgId);

  // ── Auto-set single-company value on mount ─────────────────────────────────
  // When the company list resolves to exactly one entry and the form value is
  // still empty (not yet set by the form default or a pre-fill), silently push
  // the single company code into the form state. This is the critical behaviour
  // for single-tenant orgs: the field is hidden but the value is still sent.
  useEffect(() => {
    if (companies.length === 1 && !value) {
      onChange(companies[0].companyCode);
    }
  }, [companies, value, onChange]);

  // ── Loading state ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <StyledSelect
        disabled
        $disabled
        aria-busy="true"
        aria-label="Loading companies"
      >
        <option value="">Loading companies…</option>
      </StyledSelect>
    );
  }

  // ── Single-company state ───────────────────────────────────────────────────
  // Render a disabled select with the single option pre-selected so the user
  // has visible confirmation of the auto-filled value. The useEffect above
  // has already fired onChange to push the code into form state.
  if (companies.length === 1) {
    const only = companies[0];
    return (
      <>
        <StyledSelect
          value={only.companyCode}
          disabled
          $disabled
          $hasError={hasError}
          aria-invalid={hasError ? 'true' : undefined}
          aria-describedby={describedBy}
          aria-label={`Auto-selected company: ${only.companyCode} ${only.legalName}`}
        >
          <option value={only.companyCode}>
            {only.companyCode} — {only.legalName}
          </option>
        </StyledSelect>
        <HelpText>
          Auto-selected — this is the only company configured on your tenant.
        </HelpText>
      </>
    );
  }

  // ── Zero-company state ─────────────────────────────────────────────────────
  if (companies.length === 0) {
    return (
      <>
        <StyledSelect
          disabled
          $disabled
          $hasError={hasError}
          aria-invalid={hasError ? 'true' : undefined}
          aria-describedby={describedBy}
        >
          <option value="">No companies configured</option>
        </StyledSelect>
        <HelpText>
          Finance is not set up for this organisation.{' '}
          <HelpLink href="/settings/finance" tabIndex={0}>
            Configure finance
          </HelpLink>{' '}
          before creating sales documents.
        </HelpText>
      </>
    );
  }

  // ── Multi-company state ────────────────────────────────────────────────────
  return (
    <StyledSelect
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      $disabled={disabled}
      $hasError={hasError}
      aria-invalid={hasError ? 'true' : undefined}
      aria-describedby={describedBy}
    >
      <option value="" disabled>
        Select a company…
      </option>
      {companies.map((company) => (
        <option key={company.companyCode} value={company.companyCode}>
          {company.companyCode} — {company.legalName}
        </option>
      ))}
    </StyledSelect>
  );
}
