/**
 * PostingSetupPage
 *
 * Finance controller screen for configuring which GL accounts the posting
 * engine uses for each accounting event (AP Control, Bank, GR/IR Clearing,
 * Input VAT, Retained Earnings, etc.).
 *
 * Route: /finance/posting-setup
 *
 * Role gating:
 *   View: accountant, finance_admin, auditor, admin, super_admin
 *   Edit (Save + dropdowns): finance_admin, admin, super_admin
 *
 * Modals do NOT close on overlay click — X button only.
 * (Project-wide rule: data-entry modals close via X, never on backdrop click.)
 * This page has no modals but the rule is noted for consistency.
 */

import { useState, useMemo, useCallback } from 'react';
import styled from 'styled-components';
import { useAuthStore } from '../../stores/auth.store';
import { showSuccessToast } from '../../stores/toast.store';
import { useFinanceAccounts } from '../../hooks/queries/useFinanceAccounts';
import { useFinanceCompanies } from '../../hooks/queries/useFinanceCompanies';
import { usePostingSetup, useUpsertPostingSetup } from '../../hooks/queries/usePostingSetup';
import type { CompanyPostingSetupUpdate, ValuationMethod } from '../../services/postingSetupService';
import { parseApiErrors } from '../../utils/apiErrors';
import type { ApiErrorItem } from '../../utils/apiErrors';
import type { GLAccount } from '../../services/financeAccountsService';
import type { Company } from '../../services/financeCompaniesService';
import { AccountCombobox } from '../../components/finance/AccountCombobox';

// ─── Role gates ────────────────────────────────────────────────────────────────

const READ_ROLES = new Set([
  'accountant',
  'finance_admin',
  'auditor',
  'admin',
  'super_admin',
]);

const WRITE_ROLES = new Set(['finance_admin', 'admin', 'super_admin']);

const PLATFORM_DEFAULT_ORG = '00000000-0000-0000-0000-000000000001';

// ─── Field-map for 422 error parsing ─────────────────────────────────────────

const POSTING_SETUP_FIELD_MAP: Record<string, string> = {
  ap_control_account_id: 'apControlAccountId',
  apControlAccountId: 'apControlAccountId',
  ar_control_account_id: 'arControlAccountId',
  arControlAccountId: 'arControlAccountId',
  bank_account_id: 'bankAccountId',
  bankAccountId: 'bankAccountId',
  cash_account_id: 'cashAccountId',
  cashAccountId: 'cashAccountId',
  gr_ir_clearing_account_id: 'grIrClearingAccountId',
  grIrClearingAccountId: 'grIrClearingAccountId',
  input_vat_account_id: 'inputVatAccountId',
  inputVatAccountId: 'inputVatAccountId',
  output_vat_account_id: 'outputVatAccountId',
  outputVatAccountId: 'outputVatAccountId',
  retained_earnings_account_id: 'retainedEarningsAccountId',
  retainedEarningsAccountId: 'retainedEarningsAccountId',
  purchase_price_variance_account_id: 'purchasePriceVarianceAccountId',
  purchasePriceVarianceAccountId: 'purchasePriceVarianceAccountId',
  rounding_account_id: 'roundingAccountId',
  roundingAccountId: 'roundingAccountId',
  default_valuation_method: 'defaultValuationMethod',
  defaultValuationMethod: 'defaultValuationMethod',
  organization_id: '__banner__',
  organizationId: '__banner__',
  company_code: '__banner__',
  companyCode: '__banner__',
};

// ─── Valuation method constants ───────────────────────────────────────────────

const VALUATION_METHODS: ValuationMethod[] = ['MovingAverage', 'Standard', 'FIFO'];

const VALUATION_LABELS: Record<ValuationMethod, string> = {
  MovingAverage: 'Moving Average',
  Standard: 'Standard',
  FIFO: 'FIFO',
};

/**
 * The subset of PostingSetupFormState fields that hold GL account IDs.
 * Used by allAssignedIds and hasDuplicateAssignment to avoid treating
 * `defaultValuationMethod` as a potential duplicate account assignment.
 */
const ACCOUNT_FIELDS: ReadonlyArray<
  Exclude<keyof PostingSetupFormState, 'defaultValuationMethod'>
> = [
  'apControlAccountId',
  'arControlAccountId',
  'bankAccountId',
  'cashAccountId',
  'grIrClearingAccountId',
  'inputVatAccountId',
  'outputVatAccountId',
  'retainedEarningsAccountId',
  'purchasePriceVarianceAccountId',
  'roundingAccountId',
] as const;

// ─── Form state type ──────────────────────────────────────────────────────────

/**
 * All ten account-assignment fields plus the company-level valuation method.
 * Account fields are stored as the accountId UUID string or empty string ("")
 * when unset (empty string is the <select> "none" sentinel).
 */
interface PostingSetupFormState {
  apControlAccountId: string;
  arControlAccountId: string;
  bankAccountId: string;
  cashAccountId: string;
  grIrClearingAccountId: string;
  inputVatAccountId: string;
  outputVatAccountId: string;
  retainedEarningsAccountId: string;
  purchasePriceVarianceAccountId: string;
  roundingAccountId: string;
  /** Per IAS 2 — company-level default valuation method for all inventory items. */
  defaultValuationMethod: ValuationMethod;
}

/** All form field keys as a union type for type-safe operations. */
type PostingSetupField = keyof PostingSetupFormState;

const EMPTY_FORM: PostingSetupFormState = {
  apControlAccountId: '',
  arControlAccountId: '',
  bankAccountId: '',
  cashAccountId: '',
  grIrClearingAccountId: '',
  inputVatAccountId: '',
  outputVatAccountId: '',
  retainedEarningsAccountId: '',
  purchasePriceVarianceAccountId: '',
  roundingAccountId: '',
  defaultValuationMethod: 'MovingAverage',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(isoString: string): string {
  try {
    return new Date(isoString).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return isoString;
  }
}

/** Convert a nullable UUID from the API to the form's empty-string sentinel. */
function nullToEmpty(v: string | null | undefined): string {
  return v ?? '';
}

/** Convert the form's empty-string sentinel back to null for the API. */
function emptyToNull(v: string): string | null {
  return v === '' ? null : v;
}

// ─── Styled components ────────────────────────────────────────────────────────

const PageContainer = styled.div`
  padding: 24px 32px;
  max-width: 960px;
  margin: 0 auto;
`;

const PageHeaderRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20px;
  margin-bottom: 6px;
  flex-wrap: wrap;
`;

const PageTitleBlock = styled.div``;

const PageTitle = styled.h1`
  font-size: 26px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.primary};
  margin: 0;
`;

const PageSubtitle = styled.p`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.secondary};
  margin: 6px 0 0;
  max-width: 620px;
  line-height: 1.55;
`;

const HeaderMeta = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  flex-shrink: 0;
`;

const CompanySelectRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const CompanySelectLabel = styled.label`
  font-size: 12px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.secondary};
  text-transform: uppercase;
  letter-spacing: 0.3px;
  white-space: nowrap;
`;

const CompanySelect = styled.select`
  padding: 7px 12px;
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: 8px;
  font-size: 13px;
  background: ${({ theme }) => theme.colors.surface.canvas};
  color: ${({ theme }) => theme.colors.text.primary};
  cursor: pointer;
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.accent.sage};
  }
`;

interface StatusPillProps {
  $complete: boolean;
}

const StatusPill = styled.span<StatusPillProps>`
  display: inline-flex;
  align-items: center;
  padding: 3px 12px;
  border-radius: 99px;
  font-size: 12px;
  font-weight: 600;
  background: ${({ $complete, theme }) =>
    $complete ? theme.colors.accent.sageSoft || '#ecfdf5' : theme.colors.status.warning || '#fffbeb'};
  color: ${({ $complete, theme }) =>
    $complete ? theme.colors.status.success || '#10b981' : theme.colors.status.warning || '#92400e'};
`;

const LastUpdatedText = styled.p`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.text.tertiary};
  margin: 0;
  text-align: right;
`;

const Divider = styled.div`
  height: 1px;
  background: ${({ theme }) => theme.colors.surface.sunken};
  margin: 20px 0 28px;
`;

/** Inline top banner (success or warning). */
const BannerBase = styled.div`
  padding: 12px 16px;
  border-radius: 10px;
  font-size: 13px;
  margin-bottom: 20px;
  line-height: 1.5;
`;

const BannerError = styled(BannerBase)`
  background: ${({ theme }) => theme.colors.status.danger};
  color: ${({ theme }) => theme.colors.status.danger};
`;

const BannerSuccess = styled(BannerBase)`
  background: ${({ theme }) => theme.colors.accent.sageSoft || '#ecfdf5'};
  color: ${({ theme }) => theme.colors.status.success || '#065f46'};
`;

const BannerWarning = styled(BannerBase)`
  background: ${({ theme }) => theme.colors.status.warning || '#fffbeb'};
  color: ${({ theme }) => theme.colors.status.warning || '#92400e'};
`;

const UnconfiguredHint = styled.div`
  padding: 16px 20px;
  background: ${({ theme }) => theme.colors.surface.sunken || '#eff6ff'};
  color: ${({ theme }) => theme.colors.status.info || '#1d4ed8'};
  border-radius: 10px;
  font-size: 13px;
  line-height: 1.55;
  margin-bottom: 28px;
`;

/** Section card wrapping a logical group of fields. */
const SectionCard = styled.div`
  background: ${({ theme }) => theme.colors.surface.raised};
  border: 1px solid ${({ theme }) => theme.colors.surface.sunken};
  border-radius: 12px;
  padding: 24px 28px;
  margin-bottom: 20px;
`;

const SectionTitle = styled.h2`
  font-size: 14px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: ${({ theme }) => theme.colors.text.secondary};
  margin: 0 0 18px;
`;

const FieldGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 18px 28px;

  @media (max-width: 680px) {
    grid-template-columns: 1fr;
  }
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 5px;
`;

const FormLabel = styled.label`
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.secondary};
`;

const FieldError = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.status.danger};
  margin-top: 2px;
`;

const FooterRow = styled.div`
  display: flex;
  justify-content: flex-end;
  padding-top: 8px;
  margin-bottom: 48px;
`;

const SaveButton = styled.button`
  padding: 10px 24px;
  background: ${({ theme }) => theme.colors.accent.sage};
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: background 150ms ease;
  &:hover {
    background: ${({ theme }) => theme.colors.accent.sageDeep};
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const EmptyState = styled.div`
  padding: 64px 32px;
  text-align: center;
  color: ${({ theme }) => theme.colors.text.tertiary};
  font-size: 14px;
`;

// ─── Valuation method select (company-level) ──────────────────────────────────

const ValuationSelect = styled.select`
  padding: 9px 12px;
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
  background: ${({ theme }) => theme.colors.surface.canvas};
  color: ${({ theme }) => theme.colors.text.primary};
  width: 260px;
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.accent.sage};
    box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.accent.sage}1a;
  }

  &:disabled {
    background: ${({ theme }) => theme.colors.surface.canvas};
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const HintText = styled.p`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.text.secondary};
  margin: 6px 0 0;
  line-height: 1.55;
  max-width: 560px;
`;

// ─── Account select sub-component ────────────────────────────────────────────

interface AccountSelectProps {
  id: string;
  label: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
  accounts: GLAccount[];
  /** IDs already assigned to other fields — shown disabled in options. */
  takenIds: Set<string>;
  disabled?: boolean;
  hasError?: boolean;
  errorMessage?: string;
}

function AccountSelect({
  id,
  label,
  required,
  value,
  onChange,
  accounts,
  takenIds,
  disabled,
  hasError,
  errorMessage,
}: AccountSelectProps) {
  /**
   * PostingSetupFormState stores empty string ("") as the "not set" sentinel.
   * AccountCombobox uses null for the same concept.
   * Convert at the boundary so neither component needs to know about the other's
   * internal representation.
   */
  const comboValue = value === '' ? null : value;

  const handleComboChange = (accountId: string | null) => {
    onChange(accountId ?? '');
  };

  return (
    <Field>
      <FormLabel htmlFor={id}>
        {label}
        {required && ' *'}
      </FormLabel>
      <AccountCombobox
        id={id}
        valueAccountId={comboValue}
        accounts={accounts}
        takenIds={takenIds}
        onChange={handleComboChange}
        placeholder="— Not set —"
        hasError={hasError}
        disabled={disabled}
        describedBy={errorMessage ? `${id}-err` : undefined}
      />
      {errorMessage && (
        <FieldError id={`${id}-err`} role="alert">
          {errorMessage}
        </FieldError>
      )}
    </Field>
  );
}

// ─── Main page component ──────────────────────────────────────────────────────

export function PostingSetupPage() {
  const { user } = useAuthStore();
  // Reason: showSuccessToast is a module-level helper, imported directly above.

  // ── Auth / org ─────────────────────────────────────────────────────────────

  const organizationId: string = useMemo(() => {
    if (user?.organizationId) return user.organizationId;
    if (user?.role === 'super_admin') return PLATFORM_DEFAULT_ORG;
    return '';
  }, [user]);

  const canRead = READ_ROLES.has(user?.role ?? '');
  const canWrite = WRITE_ROLES.has(user?.role ?? '');

  // ── Companies fetch ────────────────────────────────────────────────────────

  const {
    data: companiesData,
    isLoading: companiesLoading,
    isError: companiesError,
  } = useFinanceCompanies(organizationId || null);

  const companies: Company[] = useMemo(() => {
    if (companiesError) {
      // Fallback so the page stays usable even if companies endpoint is down.
      return [
        {
          companyCode: '1000',
          organizationId,
          legalName: '1000',
          trn: null,
          fiscalYearStartMonth: 1,
          fiscalYearStartDay: 1,
          defaultCurrency: 'AED',
          isLocked: false,
          createdAt: '',
          updatedAt: '',
        },
      ];
    }
    return companiesData ?? [];
  }, [companiesData, companiesError, organizationId]);

  // ── Selected company ───────────────────────────────────────────────────────

  const [selectedCompanyCode, setSelectedCompanyCode] = useState<string>('');

  // Auto-select the first company once the list loads.
  const effectiveCompanyCode =
    selectedCompanyCode || (companies[0]?.companyCode ?? '');

  // ── Accounts fetch ─────────────────────────────────────────────────────────

  const { data: accountsData, isLoading: accountsLoading } = useFinanceAccounts(
    organizationId
  );

  /**
   * Only `accountLevel === 'active'` and `isActive === true` accounts may be
   * posted to. Title and drawer accounts are not valid posting targets.
   */
  const postableAccounts: GLAccount[] = useMemo(() => {
    const all = accountsData?.items ?? [];
    return all.filter(
      (a) => a.accountLevel === 'active' && a.isActive
    );
  }, [accountsData]);

  // ── Posting setup fetch ────────────────────────────────────────────────────

  const {
    data: setupData,
    isLoading: setupLoading,
    isError: setupError,
    error: setupErrorObject,
  } = usePostingSetup(organizationId, effectiveCompanyCode);

  // Reason: log the underlying error to the console for debugging, but don't
  // block the page. If the fetch failed (network, 5xx, etc.), the user can
  // still fill in the form and save — the upsert mutation will succeed on its
  // own request. Treating fetch errors as "never configured" is the right UX:
  // worst case the user re-saves, best case the fetch error was a one-off and
  // their already-configured data shows up on the next request.
  if (setupError && setupErrorObject) {
    console.error('[PostingSetup] failed to fetch existing setup:', setupErrorObject);
  }

  const isNeverConfigured = !setupLoading && setupData === undefined;

  // ── Form state ─────────────────────────────────────────────────────────────

  /**
   * Initialise/reset the form whenever the fetched setup changes.
   * We store the last company code the form was seeded for so we can
   * reset on company change without an effect.
   */
  const formSeed = useMemo<PostingSetupFormState>(() => {
    if (!setupData) return EMPTY_FORM;
    return {
      apControlAccountId: nullToEmpty(setupData.apControlAccountId),
      arControlAccountId: nullToEmpty(setupData.arControlAccountId),
      bankAccountId: nullToEmpty(setupData.bankAccountId),
      cashAccountId: nullToEmpty(setupData.cashAccountId),
      grIrClearingAccountId: nullToEmpty(setupData.grIrClearingAccountId),
      inputVatAccountId: nullToEmpty(setupData.inputVatAccountId),
      outputVatAccountId: nullToEmpty(setupData.outputVatAccountId),
      retainedEarningsAccountId: nullToEmpty(setupData.retainedEarningsAccountId),
      purchasePriceVarianceAccountId: nullToEmpty(
        setupData.purchasePriceVarianceAccountId
      ),
      roundingAccountId: nullToEmpty(setupData.roundingAccountId),
      // Backend defaults to 'MovingAverage' when not set; fall back defensively.
      defaultValuationMethod: setupData.defaultValuationMethod ?? 'MovingAverage',
    };
  }, [setupData]);

  // seedKey changes whenever the company or fetched setup changes, which
  // causes a full form re-render — replacing stale controlled values.
  const seedKey = `${effectiveCompanyCode}|${setupData?.setupId ?? 'none'}`;

  const [form, setForm] = useState<PostingSetupFormState>(formSeed);
  const [prevSeedKey, setPrevSeedKey] = useState(seedKey);

  // Sync form when seed changes (company switch or fresh fetch).
  if (seedKey !== prevSeedKey) {
    setForm(formSeed);
    setPrevSeedKey(seedKey);
  }

  // ── Mutation ───────────────────────────────────────────────────────────────

  const upsertMutation = useUpsertPostingSetup();

  // ── Error state ────────────────────────────────────────────────────────────

  const [bannerError, setBannerError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // ── Duplicate-assignment detection ────────────────────────────────────────

  /**
   * Build a Set of accountIds that are currently assigned to some field.
   * Used to mark options as disabled (or taken) in sibling dropdowns.
   * Only considers account-type fields — not the valuation method enum.
   */
  const allAssignedIds: Set<string> = useMemo(() => {
    const ids = new Set<string>();
    for (const key of ACCOUNT_FIELDS) {
      const v = form[key] as string;
      if (v) ids.add(v);
    }
    return ids;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  /**
   * Detect if any accountId is assigned to more than one field simultaneously.
   * This can only happen when the initial data from the backend is corrupt.
   */
  const hasDuplicateAssignment: boolean = useMemo(() => {
    const values = ACCOUNT_FIELDS.map((k) => form[k] as string).filter(Boolean);
    return values.length !== new Set(values).size;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  // ── Field change handler ───────────────────────────────────────────────────

  const handleFieldChange = useCallback(
    (field: PostingSetupField) => (value: string) => {
      setForm((prev) => ({ ...prev, [field]: value }));
      setSaveSuccess(false);
      setFieldErrors((prev) => {
        if (!prev[field]) return prev;
        const next = { ...prev };
        delete next[field];
        return next;
      });
    },
    []
  );

  // ── Save handler ───────────────────────────────────────────────────────────

  const handleSave = async () => {
    setBannerError(null);
    setSaveSuccess(false);
    setFieldErrors({});

    const payload: CompanyPostingSetupUpdate = {
      apControlAccountId: emptyToNull(form.apControlAccountId),
      arControlAccountId: emptyToNull(form.arControlAccountId),
      bankAccountId: emptyToNull(form.bankAccountId),
      cashAccountId: emptyToNull(form.cashAccountId),
      grIrClearingAccountId: emptyToNull(form.grIrClearingAccountId),
      inputVatAccountId: emptyToNull(form.inputVatAccountId),
      outputVatAccountId: emptyToNull(form.outputVatAccountId),
      retainedEarningsAccountId: emptyToNull(form.retainedEarningsAccountId),
      purchasePriceVarianceAccountId: emptyToNull(
        form.purchasePriceVarianceAccountId
      ),
      roundingAccountId: emptyToNull(form.roundingAccountId),
      defaultValuationMethod: form.defaultValuationMethod,
    };

    try {
      const result = await upsertMutation.mutateAsync({
        orgId: organizationId,
        companyCode: effectiveCompanyCode,
        data: payload,
      });

      if (result.isComplete) {
        showSuccessToast('Posting setup saved. Configuration is complete.');
      } else {
        setSaveSuccess(true);
      }
    } catch (err: unknown) {
      const axiosErr = err as {
        response?: { data?: { detail?: unknown }; status?: number };
        message?: string;
      };
      const detail = axiosErr?.response?.data?.detail;

      if (Array.isArray(detail)) {
        const parsed = parseApiErrors(detail as ApiErrorItem[], POSTING_SETUP_FIELD_MAP);
        const { __banner__, ...perField } = parsed;
        setFieldErrors(perField);
        if (__banner__) setBannerError(__banner__);
        else setBannerError('Please correct the highlighted fields and try again.');
      } else if (typeof detail === 'string') {
        setBannerError(detail);
      } else {
        setBannerError(
          (axiosErr?.message as string | undefined) ??
            'An unexpected error occurred. Please try again.'
        );
      }
    }
  };

  // ── Guard: no access ───────────────────────────────────────────────────────

  if (!canRead) {
    return (
      <PageContainer>
        <EmptyState>You don't have permission to view posting setup.</EmptyState>
      </PageContainer>
    );
  }

  if (!organizationId) {
    return (
      <PageContainer>
        <EmptyState>No organisation assigned to this account.</EmptyState>
      </PageContainer>
    );
  }

  // ── Loading / error guards ─────────────────────────────────────────────────

  const isPageLoading = companiesLoading || accountsLoading || setupLoading;

  if (isPageLoading) {
    return (
      <PageContainer>
        <EmptyState>Loading posting setup…</EmptyState>
      </PageContainer>
    );
  }

  // Reason: deliberately do NOT block on setupError. See the rationale above
  // where we log the error. The form remains usable even if the fetch fails.

  // ── Current completeness (from last saved data or derived from form) ────────

  /** True if all five required fields are set in the current form state. */
  const isFormComplete =
    !!form.apControlAccountId &&
    !!form.bankAccountId &&
    !!form.grIrClearingAccountId &&
    !!form.inputVatAccountId &&
    !!form.retainedEarningsAccountId;

  /**
   * Use `setupData.isComplete` as the source of truth for the badge after save.
   * Before any save, derive it from the form's field values.
   */
  const badgeIsComplete = setupData?.isComplete ?? isFormComplete;

  const isMutating = upsertMutation.isPending;
  const isSaveDisabled = isMutating || setupLoading;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <PageContainer>
      {/* ── Page header ── */}
      <PageHeaderRow>
        <PageTitleBlock>
          <PageTitle>Posting Setup</PageTitle>
          <PageSubtitle>
            Configure which GL accounts are used for each accounting event.
            These accounts are referenced by the posting engine when goods
            receipts, invoices, and payments are posted.
          </PageSubtitle>
        </PageTitleBlock>

        <HeaderMeta>
          {/* Company selector */}
          <CompanySelectRow>
            <CompanySelectLabel htmlFor="ps-company-select">Company</CompanySelectLabel>
            <CompanySelect
              id="ps-company-select"
              value={effectiveCompanyCode}
              onChange={(e) => {
                setSelectedCompanyCode(e.target.value);
                setBannerError(null);
                setSaveSuccess(false);
                setFieldErrors({});
              }}
              aria-label="Select company"
            >
              {companies.map((c) => (
                <option key={c.companyCode} value={c.companyCode}>
                  {c.companyCode} — {c.legalName}
                </option>
              ))}
            </CompanySelect>
          </CompanySelectRow>

          {/* Completeness badge */}
          {!isNeverConfigured && (
            <StatusPill $complete={badgeIsComplete} role="status">
              {badgeIsComplete ? 'Configured' : 'Setup Incomplete'}
            </StatusPill>
          )}

          {/* Last-updated metadata */}
          {setupData?.updatedAt ? (
            <LastUpdatedText>
              Last updated
              {setupData.updatedBy ? ` by ${setupData.updatedBy}` : ''}
              {' '}on {formatDate(setupData.updatedAt)}
            </LastUpdatedText>
          ) : isNeverConfigured ? (
            <LastUpdatedText>Never configured</LastUpdatedText>
          ) : null}
        </HeaderMeta>
      </PageHeaderRow>

      <Divider />

      {/* ── Unconfigured hint (first-time setup) ── */}
      {isNeverConfigured && (
        <UnconfiguredHint role="note">
          This company has not been configured yet. Pick GL accounts for each
          field below, then save. Required fields are marked with{' '}
          <strong>*</strong>. Setup must be complete before posting can run.
        </UnconfiguredHint>
      )}

      {/* ── Duplicate-assignment warning (data corruption guard) ── */}
      {hasDuplicateAssignment && (
        <BannerWarning role="alert">
          Warning: one or more GL accounts are assigned to multiple roles. This
          should not happen in normal operation. Please review the selections
          below and ensure each account is used for only one purpose.
        </BannerWarning>
      )}

      {/* ── Save error banner ── */}
      {bannerError && (
        <BannerError role="alert">{bannerError}</BannerError>
      )}

      {/* ── Save success banner (when isComplete=false after save) ── */}
      {saveSuccess && !isMutating && (
        <BannerSuccess role="status">
          Configuration saved. Set all required fields (*) and save again to
          complete the setup.
        </BannerSuccess>
      )}

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* Section 1 — Payables                                                 */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <SectionCard>
        <SectionTitle>Payables</SectionTitle>
        <FieldGrid>
          <AccountSelect
            id="ps-apControl"
            label="AP Control Account"
            required
            value={form.apControlAccountId}
            onChange={handleFieldChange('apControlAccountId')}
            accounts={postableAccounts}
            takenIds={allAssignedIds}
            disabled={!canWrite}
            hasError={!!fieldErrors.apControlAccountId}
            errorMessage={fieldErrors.apControlAccountId}
          />
          <AccountSelect
            id="ps-ppVariance"
            label="Purchase Price Variance Account"
            value={form.purchasePriceVarianceAccountId}
            onChange={handleFieldChange('purchasePriceVarianceAccountId')}
            accounts={postableAccounts}
            takenIds={allAssignedIds}
            disabled={!canWrite}
            hasError={!!fieldErrors.purchasePriceVarianceAccountId}
            errorMessage={fieldErrors.purchasePriceVarianceAccountId}
          />
          <AccountSelect
            id="ps-rounding"
            label="Rounding Account"
            value={form.roundingAccountId}
            onChange={handleFieldChange('roundingAccountId')}
            accounts={postableAccounts}
            takenIds={allAssignedIds}
            disabled={!canWrite}
            hasError={!!fieldErrors.roundingAccountId}
            errorMessage={fieldErrors.roundingAccountId}
          />
        </FieldGrid>
      </SectionCard>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* Section 2 — Receivables                                              */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <SectionCard>
        <SectionTitle>Receivables</SectionTitle>
        <FieldGrid>
          <AccountSelect
            id="ps-arControl"
            label="AR Control Account"
            value={form.arControlAccountId}
            onChange={handleFieldChange('arControlAccountId')}
            accounts={postableAccounts}
            takenIds={allAssignedIds}
            disabled={!canWrite}
            hasError={!!fieldErrors.arControlAccountId}
            errorMessage={fieldErrors.arControlAccountId}
          />
        </FieldGrid>
      </SectionCard>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* Section 3 — Cash & Bank                                              */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <SectionCard>
        <SectionTitle>Cash &amp; Bank</SectionTitle>
        <FieldGrid>
          <AccountSelect
            id="ps-bank"
            label="Bank Account"
            required
            value={form.bankAccountId}
            onChange={handleFieldChange('bankAccountId')}
            accounts={postableAccounts}
            takenIds={allAssignedIds}
            disabled={!canWrite}
            hasError={!!fieldErrors.bankAccountId}
            errorMessage={fieldErrors.bankAccountId}
          />
          <AccountSelect
            id="ps-cash"
            label="Cash Account"
            value={form.cashAccountId}
            onChange={handleFieldChange('cashAccountId')}
            accounts={postableAccounts}
            takenIds={allAssignedIds}
            disabled={!canWrite}
            hasError={!!fieldErrors.cashAccountId}
            errorMessage={fieldErrors.cashAccountId}
          />
        </FieldGrid>
      </SectionCard>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* Section 4 — Tax                                                       */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <SectionCard>
        <SectionTitle>Tax</SectionTitle>
        <FieldGrid>
          <AccountSelect
            id="ps-inputVat"
            label="Input VAT Account"
            required
            value={form.inputVatAccountId}
            onChange={handleFieldChange('inputVatAccountId')}
            accounts={postableAccounts}
            takenIds={allAssignedIds}
            disabled={!canWrite}
            hasError={!!fieldErrors.inputVatAccountId}
            errorMessage={fieldErrors.inputVatAccountId}
          />
          <AccountSelect
            id="ps-outputVat"
            label="Output VAT Account"
            value={form.outputVatAccountId}
            onChange={handleFieldChange('outputVatAccountId')}
            accounts={postableAccounts}
            takenIds={allAssignedIds}
            disabled={!canWrite}
            hasError={!!fieldErrors.outputVatAccountId}
            errorMessage={fieldErrors.outputVatAccountId}
          />
        </FieldGrid>
      </SectionCard>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* Section 5 — Inventory & Goods Receipt                                */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <SectionCard>
        <SectionTitle>Inventory &amp; Goods Receipt</SectionTitle>
        <FieldGrid>
          <AccountSelect
            id="ps-grIr"
            label="GR/IR Clearing Account"
            required
            value={form.grIrClearingAccountId}
            onChange={handleFieldChange('grIrClearingAccountId')}
            accounts={postableAccounts}
            takenIds={allAssignedIds}
            disabled={!canWrite}
            hasError={!!fieldErrors.grIrClearingAccountId}
            errorMessage={fieldErrors.grIrClearingAccountId}
          />
        </FieldGrid>
      </SectionCard>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* Section 6 — Inventory Valuation                                       */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <SectionCard>
        <SectionTitle>Inventory Valuation</SectionTitle>
        <Field>
          <FormLabel htmlFor="ps-valuation-method">
            Default Valuation Method *
          </FormLabel>
          {canWrite ? (
            <ValuationSelect
              id="ps-valuation-method"
              value={form.defaultValuationMethod}
              onChange={(e) => {
                setForm((prev) => ({
                  ...prev,
                  defaultValuationMethod: e.target.value as ValuationMethod,
                }));
                setSaveSuccess(false);
                setFieldErrors((prev) => {
                  if (!prev.defaultValuationMethod) return prev;
                  const next = { ...prev };
                  delete next.defaultValuationMethod;
                  return next;
                });
              }}
              aria-describedby="ps-valuation-hint"
            >
              {VALUATION_METHODS.map((vm) => (
                <option key={vm} value={vm}>
                  {VALUATION_LABELS[vm]}
                </option>
              ))}
            </ValuationSelect>
          ) : (
            <span style={{ fontSize: 14 }}>
              {VALUATION_LABELS[form.defaultValuationMethod]}
            </span>
          )}
          {fieldErrors.defaultValuationMethod && (
            <FieldError role="alert">{fieldErrors.defaultValuationMethod}</FieldError>
          )}
          <HintText id="ps-valuation-hint">
            Per IAS 2, the same cost formula must be applied across inventory items of similar
            nature. Set once at the company level.
          </HintText>
        </Field>
      </SectionCard>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* Section 7 — Equity                                                    */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <SectionCard>
        <SectionTitle>Equity</SectionTitle>
        <FieldGrid>
          <AccountSelect
            id="ps-retainedEarnings"
            label="Retained Earnings Account"
            required
            value={form.retainedEarningsAccountId}
            onChange={handleFieldChange('retainedEarningsAccountId')}
            accounts={postableAccounts}
            takenIds={allAssignedIds}
            disabled={!canWrite}
            hasError={!!fieldErrors.retainedEarningsAccountId}
            errorMessage={fieldErrors.retainedEarningsAccountId}
          />
        </FieldGrid>
      </SectionCard>

      {/* ── Save button ── */}
      {canWrite && (
        <FooterRow>
          <SaveButton
            onClick={handleSave}
            disabled={isSaveDisabled}
            aria-label="Save posting configuration"
          >
            {isMutating ? 'Saving…' : 'Save Configuration'}
          </SaveButton>
        </FooterRow>
      )}
    </PageContainer>
  );
}
