/**
 * TenantSetupWizardPage
 *
 * Multi-step bootstrap wizard for fresh-deployment scenarios where a
 * super_admin account exists but has no organization assigned, making
 * the finance UI completely unusable.
 *
 * Route: /admin/tenant-setup
 * Access: super_admin only
 *
 * Steps:
 *   0 — Welcome / status check (auto-skip completed steps)
 *   1 — Organization (pick existing or create new)
 *   2 — Self-assign (PATCH /admin/users/{id}/organization)
 *   3 — Finance company code (POST /finance/companies — seeds CoA)
 *   4 — First fiscal period (POST /finance/periods)
 *   5 — Done
 *
 * State is local (useReducer) — no global state needed.
 * Modals close via X button only (project rule: no backdrop dismiss).
 *
 * Backend contract deviations from the original spec (verified against source):
 *   - CompanyCodeCreate uses `legalName` (not `companyName`)
 *   - CompanyCodeCreate uses `defaultCurrency` (not `currencyCode`)
 *   - CompanyCodeCreate has NO `country` or `defaultValuationMethod` fields
 *   - FiscalPeriodCreate has NO `organizationId` or `status` fields
 *   - POST /finance/companies returns SuccessResponse envelope → response.data.data
 */

import React, { useReducer } from 'react';
import styled, { keyframes } from 'styled-components';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import { useOrganizations, useCreateOrganization, useAssignUserOrg } from '../../hooks/queries/useOrganizations';
import { useFinanceCompanies, useCreateCompany } from '../../hooks/queries/useFinanceCompanies';
import { useCreatePeriod } from '../../hooks/queries/useFiscalPeriods';
import { useToastStore } from '../../stores/toast.store';
import type { OrganizationResponse } from '../../services/tenantBootstrapService';
import type { Company } from '../../services/financeCompaniesService';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function firstOfMonth(year: number, month: number): string {
  return new Date(year, month - 1, 1).toISOString().slice(0, 10);
}

function lastOfMonth(year: number, month: number): string {
  return new Date(year, month, 0).toISOString().slice(0, 10);
}

function extractError(err: unknown, fallback: string): string {
  if (!err || typeof err !== 'object') return fallback;
  const e = err as {
    response?: { data?: { detail?: unknown; message?: string }; status?: number };
    message?: string;
  };
  const detail = e?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (typeof e?.response?.data?.message === 'string') return e.response!.data!.message!;
  return e?.message ?? fallback;
}

// ─── Wizard state ─────────────────────────────────────────────────────────────

interface WizardState {
  /** Current wizard step (0 = welcome, 5 = done) */
  step: number;
  /** The org picked/created in step 1 */
  selectedOrgId: string;
  selectedOrgName: string;
  /** The company code created in step 3 */
  createdCompanyCode: string;
  seedMessage: string;
  /** The period created in step 4 */
  createdPeriodCode: string;
}

type WizardAction =
  | { type: 'SET_STEP'; step: number }
  | { type: 'SET_ORG'; orgId: string; orgName: string }
  | { type: 'SET_COMPANY'; companyCode: string; seedMessage: string }
  | { type: 'SET_PERIOD'; periodCode: string };

function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'SET_STEP':
      return { ...state, step: action.step };
    case 'SET_ORG':
      return { ...state, selectedOrgId: action.orgId, selectedOrgName: action.orgName };
    case 'SET_COMPANY':
      return { ...state, createdCompanyCode: action.companyCode, seedMessage: action.seedMessage };
    case 'SET_PERIOD':
      return { ...state, createdPeriodCode: action.periodCode };
    default:
      return state;
  }
}

const initialWizardState: WizardState = {
  step: 0,
  selectedOrgId: '',
  selectedOrgName: '',
  createdCompanyCode: '',
  seedMessage: '',
  createdPeriodCode: '',
};

// ─── Animation ────────────────────────────────────────────────────────────────

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
`;

// ─── Styled components ────────────────────────────────────────────────────────

const PageContainer = styled.div`
  min-height: 100vh;
  padding: 32px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: ${({ theme }) => theme.colors.background};
`;

const WizardCard = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
  width: 100%;
  max-width: 600px;
  padding: 36px 36px 28px;
  animation: ${fadeIn} 250ms ease;
`;

const WizardTitle = styled.h1`
  font-size: 22px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 6px;
`;

const WizardSubtitle = styled.p`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0 0 28px;
  line-height: 1.65;
`;

// ─── Step indicator ───────────────────────────────────────────────────────────

const StepIndicatorRow = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 28px;
  gap: 0;
`;

const StepDot = styled.div<{ $state: 'done' | 'active' | 'upcoming' }>`
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
  transition: background 200ms, border-color 200ms;

  ${({ $state, theme }) => {
    if ($state === 'done') return `
      background: ${theme.colors.success || '#22c55e'};
      color: white;
      border: 2px solid ${theme.colors.success || '#22c55e'};
    `;
    if ($state === 'active') return `
      background: ${theme.colors.primary[500]};
      color: white;
      border: 2px solid ${theme.colors.primary[500]};
    `;
    return `
      background: transparent;
      color: ${theme.colors.textSecondary};
      border: 2px solid ${theme.colors.neutral[300]};
    `;
  }}
`;

const StepConnector = styled.div<{ $done: boolean }>`
  flex: 1;
  height: 2px;
  background: ${({ $done, theme }) =>
    $done ? (theme.colors.success || '#22c55e') : theme.colors.neutral[200]};
  transition: background 200ms;
  min-width: 8px;
`;

const StepLabel = styled.span<{ $active: boolean }>`
  display: none;
  @media (min-width: 480px) {
    display: block;
  }
  font-size: 11px;
  font-weight: ${({ $active }) => ($active ? 600 : 400)};
  color: ${({ $active, theme }) =>
    $active ? theme.colors.textPrimary : theme.colors.textSecondary};
  white-space: nowrap;
  margin-top: 6px;
`;

// Individual step wrapper
const StepItem = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
`;

// ─── Form primitives (shared across steps) ────────────────────────────────────

const FieldGroup = styled.div`
  margin-bottom: 18px;
`;

const FieldLabel = styled.label`
  display: block;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: 6px;
`;

const FieldInput = styled.input`
  width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.textPrimary};
  transition: border-color 150ms;
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary[500]};
  }
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const FieldSelect = styled.select`
  width: 100%;
  padding: 10px 12px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.textPrimary};
  cursor: pointer;
  transition: border-color 150ms;
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary[500]};
  }
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const FieldHint = styled.p`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 4px 0 0;
  line-height: 1.5;
`;

const ErrorText = styled.p`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.error || '#dc2626'};
  background: ${({ theme }) => theme.colors.errorBg || '#fef2f2'};
  border-radius: 8px;
  padding: 10px 14px;
  margin: 0 0 16px;
  line-height: 1.5;
`;

// ─── Buttons ──────────────────────────────────────────────────────────────────

const ButtonRow = styled.div`
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 24px;
`;

const PrimaryButton = styled.button`
  padding: 10px 22px;
  background: ${({ theme }) => theme.colors.primary[500]};
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: background 150ms;
  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.primary[700]};
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const SecondaryButton = styled.button`
  padding: 10px 22px;
  background: transparent;
  color: ${({ theme }) => theme.colors.textSecondary};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  transition: background 150ms, color 150ms;
  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.neutral[100]};
    color: ${({ theme }) => theme.colors.textPrimary};
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

// ─── Status row (step 0) ──────────────────────────────────────────────────────

const StatusGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 24px;
`;

const StatusCell = styled.div<{ $ok: boolean }>`
  padding: 14px 16px;
  border-radius: 10px;
  border: 1px solid ${({ $ok, theme }) =>
    $ok ? (theme.colors.success || '#22c55e') + '44' : theme.colors.neutral[200]};
  background: ${({ $ok }) => ($ok ? '#f0fdf4' : 'transparent')};
`;

const StatusCellTitle = styled.p`
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0 0 4px;
`;

const StatusCellValue = styled.p<{ $ok: boolean }>`
  font-size: 13px;
  font-weight: 600;
  color: ${({ $ok, theme }) =>
    $ok ? (theme.colors.success || '#22c55e') : theme.colors.textSecondary};
  margin: 0;
`;

// ─── Confirmation panel (step 3 success) ─────────────────────────────────────

const SeedPanel = styled.div`
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 10px;
  padding: 14px 16px;
  margin-bottom: 20px;
  font-size: 13px;
  color: #166534;
  line-height: 1.6;
`;

// ─── Divider ──────────────────────────────────────────────────────────────────

const Divider = styled.div`
  height: 1px;
  background: ${({ theme }) => theme.colors.neutral[200]};
  margin: 20px 0;
`;

// ─── Inline link button ───────────────────────────────────────────────────────

const TextButton = styled.button`
  background: none;
  border: none;
  padding: 0;
  font-size: 13px;
  font-family: inherit;
  color: ${({ theme }) => theme.colors.primary[500]};
  cursor: pointer;
  text-decoration: underline;
  &:hover {
    color: ${({ theme }) => theme.colors.primary[700]};
  }
`;

// ─── Step 0 — Welcome / Status Check ─────────────────────────────────────────

interface Step0Props {
  orgs: OrganizationResponse[];
  orgsLoading: boolean;
  userOrgId: string | null;
  hasCompany: boolean;
  hasPeriod: boolean;
  onBegin: (startStep: number) => void;
}

function Step0Welcome({
  orgs,
  orgsLoading,
  userOrgId,
  hasCompany,
  hasPeriod,
  onBegin,
}: Step0Props) {
  const orgName = orgs.find((o) => o.organizationId === userOrgId)?.name ?? null;
  const hasOrg = orgs.length > 0;
  const isAssigned = !!userOrgId;

  const handleBegin = () => {
    // Auto-skip to first incomplete step
    if (!hasOrg && !isAssigned) {
      onBegin(1); // need to create/pick org
    } else if (!isAssigned) {
      onBegin(1); // orgs exist but user not assigned
    } else if (!hasCompany) {
      onBegin(3); // org assigned, but no company
    } else if (!hasPeriod) {
      onBegin(4); // company exists, but no period
    } else {
      onBegin(5); // everything done
    }
  };

  return (
    <>
      <WizardSubtitle>
        This wizard will guide you through the one-time platform setup: create your
        organization, assign your account, seed the Chart of Accounts, and set up your
        first fiscal period.
      </WizardSubtitle>

      {orgsLoading ? (
        <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 24 }}>
          Checking current state…
        </p>
      ) : (
        <StatusGrid>
          <StatusCell $ok={hasOrg}>
            <StatusCellTitle>Organizations</StatusCellTitle>
            <StatusCellValue $ok={hasOrg}>
              {hasOrg ? `${orgs.length} exist${orgs.length === 1 ? 's' : ''}` : 'None yet'}
            </StatusCellValue>
          </StatusCell>
          <StatusCell $ok={isAssigned}>
            <StatusCellTitle>Your Assignment</StatusCellTitle>
            <StatusCellValue $ok={isAssigned}>
              {isAssigned ? (orgName ?? 'Assigned') : 'Not assigned'}
            </StatusCellValue>
          </StatusCell>
          <StatusCell $ok={hasCompany}>
            <StatusCellTitle>Company Code</StatusCellTitle>
            <StatusCellValue $ok={hasCompany}>
              {hasCompany ? 'Configured' : 'Not set up'}
            </StatusCellValue>
          </StatusCell>
          <StatusCell $ok={hasPeriod}>
            <StatusCellTitle>Fiscal Period</StatusCellTitle>
            <StatusCellValue $ok={hasPeriod}>
              {hasPeriod ? 'Exists' : 'Not set up'}
            </StatusCellValue>
          </StatusCell>
        </StatusGrid>
      )}

      <ButtonRow>
        <PrimaryButton onClick={handleBegin} disabled={orgsLoading}>
          {orgsLoading ? 'Checking…' : 'Begin Setup'}
        </PrimaryButton>
      </ButtonRow>
    </>
  );
}

// ─── Step 1 — Organization ────────────────────────────────────────────────────

interface Step1Props {
  orgs: OrganizationResponse[];
  onOrgSelected: (orgId: string, orgName: string) => void;
  onBack: () => void;
}

function Step1Organization({ orgs, onOrgSelected, onBack }: Step1Props) {
  const { addToast } = useToastStore();
  const createOrgMutation = useCreateOrganization();

  const [mode, setMode] = React.useState<'pick' | 'create'>(orgs.length === 0 ? 'create' : 'pick');
  const [selectedExistingId, setSelectedExistingId] = React.useState(
    orgs.length > 0 ? orgs[0].organizationId : ''
  );
  const [newName, setNewName] = React.useState('');
  const [newSlug, setNewSlug] = React.useState('');
  const [newIndustries, setNewIndustries] = React.useState('vegetable_fruits');
  const [newLogoUrl, setNewLogoUrl] = React.useState('');
  const [error, setError] = React.useState('');

  const handleNameChange = (v: string) => {
    setNewName(v);
    setNewSlug(slugify(v));
  };

  const handleUseExisting = () => {
    const org = orgs.find((o) => o.organizationId === selectedExistingId);
    if (org) {
      onOrgSelected(org.organizationId, org.name);
    }
  };

  const handleCreateNew = async () => {
    setError('');
    if (!newName.trim()) {
      setError('Organization name is required.');
      return;
    }
    if (!newSlug.trim()) {
      setError('Slug is required.');
      return;
    }
    const industries = newIndustries
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (industries.length === 0) {
      setError('At least one industry is required.');
      return;
    }

    try {
      const org = await createOrgMutation.mutateAsync({
        name: newName.trim(),
        slug: newSlug.trim(),
        industries,
        logoUrl: newLogoUrl.trim() || undefined,
      });
      addToast('success', `Organization "${org.name}" created.`);
      onOrgSelected(org.organizationId, org.name);
    } catch (err) {
      setError(extractError(err, 'Failed to create organization. The slug may already be in use.'));
    }
  };

  const isCreating = createOrgMutation.isPending;

  return (
    <>
      <WizardSubtitle>
        Select an existing organization or create a new one. This becomes the tenant all
        finance data will be scoped to.
      </WizardSubtitle>

      {error && <ErrorText role="alert">{error}</ErrorText>}

      {/* Tabs */}
      {orgs.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <SecondaryButton
            type="button"
            style={{
              background: mode === 'pick' ? 'transparent' : undefined,
              borderColor: mode === 'pick' ? '#3b82f6' : undefined,
              color: mode === 'pick' ? '#3b82f6' : undefined,
            }}
            onClick={() => setMode('pick')}
          >
            Use Existing
          </SecondaryButton>
          <SecondaryButton
            type="button"
            style={{
              borderColor: mode === 'create' ? '#3b82f6' : undefined,
              color: mode === 'create' ? '#3b82f6' : undefined,
            }}
            onClick={() => setMode('create')}
          >
            + Create New
          </SecondaryButton>
        </div>
      )}

      {mode === 'pick' && orgs.length > 0 && (
        <>
          <FieldGroup>
            <FieldLabel htmlFor="wiz-org-pick">Organization</FieldLabel>
            <FieldSelect
              id="wiz-org-pick"
              value={selectedExistingId}
              onChange={(e) => setSelectedExistingId(e.target.value)}
            >
              {orgs.map((o) => (
                <option key={o.organizationId} value={o.organizationId}>
                  {o.name} ({o.slug})
                </option>
              ))}
            </FieldSelect>
          </FieldGroup>
          <ButtonRow>
            <SecondaryButton type="button" onClick={onBack}>
              Back
            </SecondaryButton>
            <PrimaryButton
              type="button"
              onClick={handleUseExisting}
              disabled={!selectedExistingId}
            >
              Use This Organization
            </PrimaryButton>
          </ButtonRow>
        </>
      )}

      {mode === 'create' && (
        <>
          <FieldGroup>
            <FieldLabel htmlFor="wiz-org-name">Organization Name *</FieldLabel>
            <FieldInput
              id="wiz-org-name"
              type="text"
              value={newName}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. A64 Farms"
              disabled={isCreating}
            />
          </FieldGroup>
          <FieldGroup>
            <FieldLabel htmlFor="wiz-org-slug">Slug *</FieldLabel>
            <FieldInput
              id="wiz-org-slug"
              type="text"
              value={newSlug}
              onChange={(e) => setNewSlug(e.target.value)}
              placeholder="e.g. a64-farms"
              disabled={isCreating}
            />
            <FieldHint>URL-friendly identifier. Must be unique across all organizations.</FieldHint>
          </FieldGroup>
          <FieldGroup>
            <FieldLabel htmlFor="wiz-org-industries">Industries *</FieldLabel>
            <FieldInput
              id="wiz-org-industries"
              type="text"
              value={newIndustries}
              onChange={(e) => setNewIndustries(e.target.value)}
              placeholder="e.g. vegetable_fruits, mushroom"
              disabled={isCreating}
            />
            <FieldHint>Comma-separated industry types (e.g. vegetable_fruits, mushroom).</FieldHint>
          </FieldGroup>
          <FieldGroup>
            <FieldLabel htmlFor="wiz-org-logo">Logo URL (optional)</FieldLabel>
            <FieldInput
              id="wiz-org-logo"
              type="url"
              value={newLogoUrl}
              onChange={(e) => setNewLogoUrl(e.target.value)}
              placeholder="https://example.com/logo.png"
              disabled={isCreating}
            />
          </FieldGroup>
          <ButtonRow>
            {orgs.length > 0 && (
              <SecondaryButton type="button" onClick={() => setMode('pick')} disabled={isCreating}>
                Back
              </SecondaryButton>
            )}
            {orgs.length === 0 && (
              <SecondaryButton type="button" onClick={onBack} disabled={isCreating}>
                Back
              </SecondaryButton>
            )}
            <PrimaryButton
              type="button"
              onClick={handleCreateNew}
              disabled={isCreating || !newName.trim() || !newSlug.trim()}
            >
              {isCreating ? 'Creating…' : 'Create Organization'}
            </PrimaryButton>
          </ButtonRow>
        </>
      )}
    </>
  );
}

// ─── Step 2 — Self-assign ─────────────────────────────────────────────────────

interface Step2Props {
  userId: string;
  orgId: string;
  orgName: string;
  onAssigned: () => void;
  onBack: () => void;
  onRefreshUser: () => Promise<void>;
}

function Step2SelfAssign({ userId, orgId, orgName, onAssigned, onBack, onRefreshUser }: Step2Props) {
  const { addToast } = useToastStore();
  const assignMutation = useAssignUserOrg();
  const [error, setError] = React.useState('');
  const [assigning, setAssigning] = React.useState(false);

  const handleAssign = async () => {
    setError('');
    setAssigning(true);
    try {
      await assignMutation.mutateAsync({ userId, payload: { organizationId: orgId } });
      // Refresh client-side user so organizationId appears in the store
      await onRefreshUser();
      addToast('success', `Assigned to "${orgName}" successfully.`);
      onAssigned();
    } catch (err) {
      setError(extractError(err, 'Failed to assign organization. Please try again.'));
    } finally {
      setAssigning(false);
    }
  };

  return (
    <>
      <WizardSubtitle>
        Your account will be assigned to <strong>{orgName}</strong>. This enables the
        finance module and all organization-scoped features.
      </WizardSubtitle>

      {error && <ErrorText role="alert">{error}</ErrorText>}

      <div
        style={{
          background: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: 10,
          padding: '14px 16px',
          marginBottom: 20,
          fontSize: 14,
          color: '#1e40af',
          lineHeight: 1.65,
        }}
      >
        <strong>What this does:</strong>
        <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
          <li>Sets your <code>organizationId</code> in the platform database.</li>
          <li>Refreshes your session so the new org is reflected immediately.</li>
          <li>Enables the finance UI, Chart of Accounts, and all org-scoped data.</li>
        </ul>
      </div>

      <ButtonRow>
        <SecondaryButton type="button" onClick={onBack} disabled={assigning}>
          Back
        </SecondaryButton>
        <PrimaryButton type="button" onClick={handleAssign} disabled={assigning}>
          {assigning ? 'Assigning…' : `Assign Me to "${orgName}"`}
        </PrimaryButton>
      </ButtonRow>
    </>
  );
}

// ─── Step 3 — Company Code ────────────────────────────────────────────────────

interface Step3Props {
  orgId: string;
  orgName: string;
  onCreated: (companyCode: string, seedMessage: string) => void;
  onBack: () => void;
}

function Step3CompanyCode({ orgId, orgName, onCreated, onBack }: Step3Props) {
  const { addToast } = useToastStore();
  const createCompanyMutation = useCreateCompany();

  const [companyCode, setCompanyCode] = React.useState('1000');
  const [legalName, setLegalName] = React.useState(orgName);
  const [defaultCurrency, setDefaultCurrency] = React.useState('AED');
  const [trn, setTrn] = React.useState('');
  const [fiscalStartMonth, setFiscalStartMonth] = React.useState(1);
  const [error, setError] = React.useState('');

  const handleCreate = async () => {
    setError('');
    if (!companyCode.trim()) {
      setError('Company code is required.');
      return;
    }
    if (!legalName.trim()) {
      setError('Legal name is required.');
      return;
    }
    if (defaultCurrency.length !== 3) {
      setError('Currency code must be exactly 3 characters (e.g. AED, USD).');
      return;
    }

    try {
      const result = await createCompanyMutation.mutateAsync({
        companyCode: companyCode.trim().toUpperCase(),
        organizationId: orgId,
        legalName: legalName.trim(),
        defaultCurrency: defaultCurrency.toUpperCase(),
        fiscalYearStartMonth: fiscalStartMonth,
        fiscalYearStartDay: 1,
        trn: trn.trim() || undefined,
      });
      const seedMsg = result.message || 'Chart of Accounts and tax codes seeded successfully.';
      addToast('success', `Company "${result.company.companyCode}" created and CoA seeded.`);
      onCreated(result.company.companyCode, seedMsg);
    } catch (err) {
      const msg = extractError(err, 'Failed to create company code.');
      setError(msg);
    }
  };

  const isCreating = createCompanyMutation.isPending;

  const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  return (
    <>
      <WizardSubtitle>
        Create the finance company code for <strong>{orgName}</strong>. This seeds the
        default Chart of Accounts (~308 accounts) and UAE VAT tax codes automatically.
      </WizardSubtitle>

      {error && <ErrorText role="alert">{error}</ErrorText>}

      <FieldGroup>
        <FieldLabel htmlFor="wiz-cc-code">Company Code *</FieldLabel>
        <FieldInput
          id="wiz-cc-code"
          type="text"
          value={companyCode}
          onChange={(e) => setCompanyCode(e.target.value.toUpperCase())}
          placeholder="e.g. 1000"
          maxLength={10}
          disabled={isCreating}
        />
        <FieldHint>Short unique identifier (max 10 characters). Conventionally "1000" for the first company.</FieldHint>
      </FieldGroup>

      <FieldGroup>
        <FieldLabel htmlFor="wiz-cc-name">Legal Name *</FieldLabel>
        <FieldInput
          id="wiz-cc-name"
          type="text"
          value={legalName}
          onChange={(e) => setLegalName(e.target.value)}
          placeholder="e.g. A64 Farms LLC"
          disabled={isCreating}
        />
      </FieldGroup>

      <FieldGroup>
        <FieldLabel htmlFor="wiz-cc-currency">Default Currency *</FieldLabel>
        <FieldInput
          id="wiz-cc-currency"
          type="text"
          value={defaultCurrency}
          onChange={(e) => setDefaultCurrency(e.target.value.toUpperCase())}
          placeholder="AED"
          maxLength={3}
          style={{ width: 100 }}
          disabled={isCreating}
        />
      </FieldGroup>

      <FieldGroup>
        <FieldLabel htmlFor="wiz-cc-fiscal-start">Fiscal Year Start Month</FieldLabel>
        <FieldSelect
          id="wiz-cc-fiscal-start"
          value={fiscalStartMonth}
          onChange={(e) => setFiscalStartMonth(parseInt(e.target.value, 10))}
          style={{ width: 200 }}
          disabled={isCreating}
        >
          {MONTHS.map((m, i) => (
            <option key={i + 1} value={i + 1}>{m}</option>
          ))}
        </FieldSelect>
      </FieldGroup>

      <FieldGroup>
        <FieldLabel htmlFor="wiz-cc-trn">Tax Registration Number (TRN) — optional</FieldLabel>
        <FieldInput
          id="wiz-cc-trn"
          type="text"
          value={trn}
          onChange={(e) => setTrn(e.target.value)}
          placeholder="e.g. 100123456700003"
          disabled={isCreating}
        />
        <FieldHint>UAE TRN is 15 digits. Leave blank if not yet registered.</FieldHint>
      </FieldGroup>

      <ButtonRow>
        <SecondaryButton type="button" onClick={onBack} disabled={isCreating}>
          Back
        </SecondaryButton>
        <PrimaryButton
          type="button"
          onClick={handleCreate}
          disabled={isCreating || !companyCode.trim() || !legalName.trim()}
        >
          {isCreating ? 'Creating & Seeding…' : 'Create Company Code'}
        </PrimaryButton>
      </ButtonRow>
    </>
  );
}

// ─── Step 4 — First Fiscal Period ─────────────────────────────────────────────

interface Step4Props {
  orgId: string;
  /**
   * All companies that exist for the current org. The wizard renders a
   * picker when length > 1 so a multi-company tenant can pick which one
   * gets the new period. preferredCode (e.g. the just-created code from
   * step 3, or "1000" by convention) becomes the initial selection.
   */
  companies: Company[];
  preferredCode: string;
  onCreated: (periodCode: string) => void;
  onBack: () => void;
}

function Step4FiscalPeriod({ orgId, companies, preferredCode, onCreated, onBack }: Step4Props) {
  const { addToast } = useToastStore();
  const createPeriodMutation = useCreatePeriod();

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-based

  // Resolve the initial company selection:
  //   1. The code the user explicitly created/picked earlier (preferredCode)
  //   2. The conventional primary code "1000" when present
  //   3. The first sorted code as a last resort
  // This avoids the bug where the fallback to companies[0] silently picked
  // an unexpected code (e.g. "2000") just because of list order.
  const sortedCodes = React.useMemo(
    () => [...companies].sort((a, b) => a.companyCode.localeCompare(b.companyCode)),
    [companies],
  );
  const initialCode = React.useMemo(() => {
    if (preferredCode && sortedCodes.some((c) => c.companyCode === preferredCode)) {
      return preferredCode;
    }
    if (sortedCodes.some((c) => c.companyCode === '1000')) {
      return '1000';
    }
    return sortedCodes[0]?.companyCode ?? '';
  }, [preferredCode, sortedCodes]);

  const [companyCode, setCompanyCode] = React.useState(initialCode);
  const [fiscalYear, setFiscalYear] = React.useState(currentYear);
  const [periodNumber, setPeriodNumber] = React.useState(currentMonth);
  const [startDate, setStartDate] = React.useState(firstOfMonth(currentYear, currentMonth));
  const [endDate, setEndDate] = React.useState(lastOfMonth(currentYear, currentMonth));
  const [error, setError] = React.useState('');

  // Recompute dates when year/periodNumber change
  const handleYearChange = (y: number) => {
    setFiscalYear(y);
    setStartDate(firstOfMonth(y, periodNumber));
    setEndDate(lastOfMonth(y, periodNumber));
  };

  const handlePeriodChange = (p: number) => {
    setPeriodNumber(p);
    setStartDate(firstOfMonth(fiscalYear, p));
    setEndDate(lastOfMonth(fiscalYear, p));
  };

  const handleCreate = async () => {
    setError('');
    if (!startDate || !endDate) {
      setError('Start and end dates are required.');
      return;
    }
    if (endDate <= startDate) {
      setError('End date must be after start date.');
      return;
    }

    // FiscalPeriodCreate requires: companyCode, fiscalYear, periodNumber, startDate, endDate
    // organizationId and status are NOT part of the create schema (backend ignores them or
    // derives them from the JWT + company record).
    try {
      await createPeriodMutation.mutateAsync({
        organizationId: orgId, // passed for cache invalidation on the hook side
        companyCode,
        fiscalYear,
        periodNumber,
        startDate,
        endDate,
        // status is not in FiscalPeriodCreate — the backend defaults to OPEN
      });
      const periodCode = `${fiscalYear}-${String(periodNumber).padStart(2, '0')}`;
      addToast('success', `Fiscal period ${periodCode} created and set to Open.`);
      onCreated(periodCode);
    } catch (err) {
      setError(extractError(err, 'Failed to create fiscal period.'));
    }
  };

  const isCreating = createPeriodMutation.isPending;

  const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  return (
    <>
      <WizardSubtitle>
        Create the first fiscal period for company <strong>{companyCode || '—'}</strong>. The
        period defaults to the current calendar month and will be set to Open status.
      </WizardSubtitle>

      {error && <ErrorText role="alert">{error}</ErrorText>}

      {sortedCodes.length > 1 && (
        <FieldGroup>
          <FieldLabel htmlFor="wiz-p-company">Company Code</FieldLabel>
          <FieldSelect
            id="wiz-p-company"
            value={companyCode}
            onChange={(e) => setCompanyCode(e.target.value)}
            disabled={isCreating}
          >
            {sortedCodes.map((c) => (
              <option key={c.companyCode} value={c.companyCode}>
                {c.companyCode} — {c.legalName || c.companyCode}
              </option>
            ))}
          </FieldSelect>
        </FieldGroup>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <FieldGroup>
          <FieldLabel htmlFor="wiz-p-year">Fiscal Year</FieldLabel>
          <FieldInput
            id="wiz-p-year"
            type="number"
            min={2000}
            max={2100}
            value={fiscalYear}
            onChange={(e) => handleYearChange(parseInt(e.target.value, 10) || fiscalYear)}
            disabled={isCreating}
          />
        </FieldGroup>
        <FieldGroup>
          <FieldLabel htmlFor="wiz-p-num">Period (Month)</FieldLabel>
          <FieldSelect
            id="wiz-p-num"
            value={periodNumber}
            onChange={(e) => handlePeriodChange(parseInt(e.target.value, 10))}
            disabled={isCreating}
          >
            {MONTHS.map((m, i) => (
              <option key={i + 1} value={i + 1}>{m} (P{i + 1})</option>
            ))}
          </FieldSelect>
        </FieldGroup>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <FieldGroup>
          <FieldLabel htmlFor="wiz-p-start">Start Date</FieldLabel>
          <FieldInput
            id="wiz-p-start"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            disabled={isCreating}
          />
        </FieldGroup>
        <FieldGroup>
          <FieldLabel htmlFor="wiz-p-end">End Date</FieldLabel>
          <FieldInput
            id="wiz-p-end"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            disabled={isCreating}
          />
        </FieldGroup>
      </div>

      <FieldHint style={{ marginBottom: 16 }}>
        Status will be set to <strong>Open</strong> automatically. You can manage periods
        from Finance &rarr; Fiscal Periods after setup.
      </FieldHint>

      <ButtonRow>
        <SecondaryButton type="button" onClick={onBack} disabled={isCreating}>
          Back
        </SecondaryButton>
        <PrimaryButton
          type="button"
          onClick={handleCreate}
          disabled={isCreating || !startDate || !endDate}
        >
          {isCreating ? 'Creating…' : 'Create Fiscal Period'}
        </PrimaryButton>
      </ButtonRow>
    </>
  );
}

// ─── Step 5 — Done ────────────────────────────────────────────────────────────

interface Step5Props {
  orgName: string;
  companyCode: string;
  seedMessage: string;
  periodCode: string;
  onDone: () => void;
}

function Step5Done({ orgName, companyCode, seedMessage, periodCode, onDone }: Step5Props) {
  return (
    <>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <span style={{ fontSize: 48 }} aria-hidden="true">✅</span>
        <p style={{ fontSize: 16, fontWeight: 600, marginTop: 12 }}>
          Platform setup complete!
        </p>
        <p style={{ fontSize: 14, color: '#6b7280', marginTop: 4 }}>
          Your tenant is ready. Here is a summary of what was created:
        </p>
      </div>

      <div
        style={{
          background: '#f0fdf4',
          border: '1px solid #bbf7d0',
          borderRadius: 10,
          padding: '16px 20px',
          marginBottom: 24,
        }}
      >
        <p style={{ fontSize: 13, margin: '0 0 8px', fontWeight: 700, color: '#15803d' }}>
          Created successfully:
        </p>
        <ul style={{ margin: 0, padding: '0 0 0 20px', fontSize: 14, color: '#166534', lineHeight: 1.8 }}>
          {orgName && <li>Organization: <strong>{orgName}</strong></li>}
          {companyCode && (
            <li>Finance Company Code: <strong>{companyCode}</strong></li>
          )}
          {seedMessage && (
            <li>{seedMessage}</li>
          )}
          {periodCode && (
            <li>First Fiscal Period: <strong>{periodCode}</strong> (Open)</li>
          )}
        </ul>
      </div>

      <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 24, lineHeight: 1.6 }}>
        You can re-run this wizard at any time from <strong>Admin &rarr; Tenant Setup</strong>
        to create additional company codes or fiscal periods.
      </p>

      <ButtonRow>
        <PrimaryButton type="button" onClick={onDone}>
          Go to Dashboard
        </PrimaryButton>
      </ButtonRow>
    </>
  );
}

// ─── Step indicator helper ────────────────────────────────────────────────────

const STEP_LABELS = ['Welcome', 'Organization', 'Assign', 'Company', 'Period', 'Done'];

function StepIndicator({ currentStep }: { currentStep: number }) {
  // Only show steps 1-5 (skip the welcome step 0 in the indicator)
  const visibleSteps = [1, 2, 3, 4, 5];
  return (
    <StepIndicatorRow aria-label="Setup progress">
      {visibleSteps.map((s, i) => {
        const state: 'done' | 'active' | 'upcoming' =
          s < currentStep ? 'done' : s === currentStep ? 'active' : 'upcoming';
        return (
          <React.Fragment key={s}>
            {i > 0 && <StepConnector $done={s <= currentStep} />}
            <StepItem>
              <StepDot $state={state} aria-label={`Step ${s}: ${STEP_LABELS[s]} — ${state}`}>
                {state === 'done' ? '✓' : s}
              </StepDot>
              <StepLabel $active={state === 'active'}>{STEP_LABELS[s]}</StepLabel>
            </StepItem>
          </React.Fragment>
        );
      })}
    </StepIndicatorRow>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TenantSetupWizardPage() {
  const navigate = useNavigate();
  const { user, refreshUser } = useAuthStore();
  const { addToast } = useToastStore();

  const [state, dispatch] = useReducer(wizardReducer, initialWizardState);

  // Guard: super_admin only
  if (user?.role !== 'super_admin') {
    return (
      <PageContainer>
        <WizardCard>
          <WizardTitle>Access Denied</WizardTitle>
          <WizardSubtitle>
            The Tenant Setup Wizard is only accessible to super_admin accounts.
          </WizardSubtitle>
        </WizardCard>
      </PageContainer>
    );
  }

  const userId = user.userId;
  const userOrgId = user.organizationId ?? null;

  // Load organizations
  const { data: orgsData, isLoading: orgsLoading } = useOrganizations();
  const orgs: OrganizationResponse[] = orgsData ?? [];

  // Determine organizationId to use for checking companies/periods
  // After step 2 assignment, use selectedOrgId; otherwise use the user's existing orgId
  const orgIdForChecks = state.selectedOrgId || userOrgId || '';

  // Check if a company exists for this org
  const { data: companiesData, isLoading: companiesLoading } =
    useFinanceCompanies(orgIdForChecks || null);
  const companies = companiesData ?? [];
  const hasCompany = companies.length > 0;

  // We don't check for periods on the welcome screen (would require a separate query)
  // to keep things simple. Just show a "check manually" state.
  const hasPeriod = false; // simplified — wizard always offers step 4

  // Step titles
  const stepTitles: Record<number, string> = {
    0: 'Platform Setup Wizard',
    1: 'Step 1 — Organization',
    2: 'Step 2 — Assign Your Account',
    3: 'Step 3 — Finance Company Code',
    4: 'Step 4 — First Fiscal Period',
    5: 'Setup Complete',
  };

  const handleBegin = (startStep: number) => {
    dispatch({ type: 'SET_STEP', step: startStep });
  };

  const handleOrgSelected = (orgId: string, orgName: string) => {
    dispatch({ type: 'SET_ORG', orgId, orgName });
    dispatch({ type: 'SET_STEP', step: 2 });
  };

  const handleAssigned = () => {
    dispatch({ type: 'SET_STEP', step: 3 });
  };

  const handleCompanyCreated = (companyCode: string, seedMessage: string) => {
    dispatch({ type: 'SET_COMPANY', companyCode, seedMessage });
    dispatch({ type: 'SET_STEP', step: 4 });
  };

  const handlePeriodCreated = (periodCode: string) => {
    dispatch({ type: 'SET_PERIOD', periodCode });
    dispatch({ type: 'SET_STEP', step: 5 });
  };

  const handleDone = () => {
    navigate('/dashboard');
  };

  // Derive effective orgName for display
  const effectiveOrgName =
    state.selectedOrgName ||
    orgs.find((o) => o.organizationId === userOrgId)?.name ||
    '';

  return (
    <PageContainer>
      <WizardCard>
        <WizardTitle>{stepTitles[state.step]}</WizardTitle>

        {/* Show step indicator only for steps 1-5 */}
        {state.step >= 1 && state.step <= 5 && (
          <StepIndicator currentStep={state.step} />
        )}

        {/* Step 0 — Welcome */}
        {state.step === 0 && (
          <Step0Welcome
            orgs={orgs}
            orgsLoading={orgsLoading || companiesLoading}
            userOrgId={userOrgId}
            hasCompany={hasCompany}
            hasPeriod={hasPeriod}
            onBegin={handleBegin}
          />
        )}

        {/* Step 1 — Organization */}
        {state.step === 1 && (
          <Step1Organization
            orgs={orgs}
            onOrgSelected={handleOrgSelected}
            onBack={() => dispatch({ type: 'SET_STEP', step: 0 })}
          />
        )}

        {/* Step 2 — Self-assign */}
        {state.step === 2 && (
          <Step2SelfAssign
            userId={userId}
            orgId={state.selectedOrgId}
            orgName={state.selectedOrgName}
            onAssigned={handleAssigned}
            onBack={() => dispatch({ type: 'SET_STEP', step: 1 })}
            onRefreshUser={refreshUser}
          />
        )}

        {/* Step 3 — Company code */}
        {state.step === 3 && (
          <Step3CompanyCode
            orgId={state.selectedOrgId || userOrgId || ''}
            orgName={effectiveOrgName}
            onCreated={handleCompanyCreated}
            onBack={() => {
              // If user was already assigned before entering wizard, skip back to step 0
              if (!state.selectedOrgId) {
                dispatch({ type: 'SET_STEP', step: 0 });
              } else {
                dispatch({ type: 'SET_STEP', step: 2 });
              }
            }}
          />
        )}

        {/* Step 4 — Fiscal period.
            Pass the full company list so Step 4 can render a picker when
            the tenant has multiple companies. preferredCode seeds the
            initial selection: the just-created code from step 3 if the
            user came through it, otherwise step 4's own heuristic kicks in
            (prefer "1000" if present, else first sorted). */}
        {state.step === 4 && (
          <Step4FiscalPeriod
            orgId={state.selectedOrgId || userOrgId || ''}
            companies={companies}
            preferredCode={state.createdCompanyCode}
            onCreated={handlePeriodCreated}
            onBack={() => dispatch({ type: 'SET_STEP', step: 3 })}
          />
        )}

        {/* Step 5 — Done.
            Same selection preference as step 4: createdCompanyCode → "1000"
            (when present) → first sorted code. Keeps the summary aligned
            with whichever company the user actually targeted. */}
        {state.step === 5 && (
          <Step5Done
            orgName={state.selectedOrgName}
            companyCode={
              state.createdCompanyCode ||
              (companies.some((c) => c.companyCode === '1000') ? '1000' : companies[0]?.companyCode) ||
              ''
            }
            seedMessage={state.seedMessage}
            periodCode={state.createdPeriodCode}
            onDone={handleDone}
          />
        )}
      </WizardCard>
    </PageContainer>
  );
}
