/**
 * RecordPaymentPage
 *
 * Single-form page for recording a new vendor payment.
 * Design choice: single-form (not multi-step) for power-user speed.
 * The invoice checkbox-table appears once a vendor is selected.
 *
 * Client-side outstanding-amount computation:
 *   1. Fetch vendor's Approved AP Invoices.
 *   2. Fetch existing payments for that vendor to collect all applications.
 *   3. outstanding = totalGross - sum(amountApplied for that apDocId).
 *   4. Show only invoices with outstanding > 0.
 *
 * Validation:
 *   - Payment Date required, must be ≤ today.
 *   - Bank Account required (AccountCombobox).
 *   - Method required.
 *   - Reference Number required when method = cheque.
 *   - At least one invoice selected.
 *   - Each amountApplied > 0 and ≤ outstanding.
 *   - Total > 0.
 *
 * Role gating: finance_admin, admin, super_admin.
 * Route: /finance/payments/new
 */

import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import styled from 'styled-components';
import { useCreatePayment } from '../../hooks/queries/usePayments';
import { getApDocTotalsPaid } from '../../services/financeReportsService';
import { usePayments } from '../../hooks/queries/usePayments';
import { useVendors } from '../../hooks/queries/usePurchasing';
import { useFinanceAccounts } from '../../hooks/queries/useFinanceAccounts';
import { AccountCombobox } from '../../components/finance/AccountCombobox';
import { apiClient } from '../../services/api';
import type { APInvoice } from '../../services/apInvoicesService';
import type { PaginatedResult } from '../../services/purchasingApi';
import { useAuthStore } from '../../stores/auth.store';
import { showSuccessToast } from '../../stores/toast.store';
import { parseApiErrors } from '../../utils/apiErrors';
import type { ApiErrorItem } from '../../utils/apiErrors';
import type { PaymentMethod } from '../../services/paymentsService';

// ─── Field → form key map for 422 error parsing ───────────────────────────────

const API_FIELD_MAP: Record<string, string> = {
  payment_date: 'paymentDate',
  bank_account_id: 'bankAccountId',
  payment_method: 'paymentMethod',
  reference_number: 'referenceNumber',
  vendor_id: 'vendorId',
  applications: 'applications',
  notes: 'notes',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(val: string | number, currency = 'AED'): string {
  const n = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(n)) return '—';
  return new Intl.NumberFormat('en-AE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(n);
}

function today(): string {
  return new Date().toISOString().split('T')[0];
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

// ─── Styled components ────────────────────────────────────────────────────────

const Container = styled.div`
  padding: 32px;
  max-width: 1100px;
  margin: 0 auto;
`;

const BackLink = styled.button`
  background: none;
  border: none;
  color: ${({ theme }) => theme.colors.accent.sage};
  font-size: 14px;
  cursor: pointer;
  padding: 0;
  margin-bottom: 20px;
  &:hover { text-decoration: underline; }
`;

const Title = styled.h1`
  font-size: 26px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text.primary};
  margin: 0 0 28px;
`;

const Card = styled.div`
  background: ${({ theme }) => theme.colors.surface.raised};
  border-radius: 12px;
  box-shadow: ${({ theme }) => theme.shadows.sm};
  padding: 24px 28px;
  margin-bottom: 20px;
`;

const CardTitle = styled.h2`
  font-size: 16px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text.primary};
  margin: 0 0 20px;
`;

const FormRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 16px;
  @media (max-width: 640px) { grid-template-columns: 1fr; }
`;

const FormRow3 = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 16px;
  margin-bottom: 16px;
  @media (max-width: 900px) { grid-template-columns: 1fr 1fr; }
  @media (max-width: 640px) { grid-template-columns: 1fr; }
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const Label = styled.label`
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.secondary};
`;

const Input = styled.input`
  padding: 10px 14px;
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: 8px;
  font-size: 14px;
  background: ${({ theme }) => theme.colors.surface.canvas};
  color: ${({ theme }) => theme.colors.text.primary};
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.accent.sage}; }
  &:disabled { opacity: 0.6; background: ${({ theme }) => theme.colors.surface.raised}; }
  &[aria-invalid='true'] { border-color: ${({ theme }) => theme.colors.status.danger || '#ef4444'}; }
`;

const Select = styled.select`
  padding: 10px 14px;
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: 8px;
  font-size: 14px;
  background: ${({ theme }) => theme.colors.surface.canvas};
  color: ${({ theme }) => theme.colors.text.primary};
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.accent.sage}; }
  &[aria-invalid='true'] { border-color: ${({ theme }) => theme.colors.status.danger || '#ef4444'}; }
`;

const Textarea = styled.textarea`
  padding: 10px 14px;
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
  resize: vertical;
  min-height: 72px;
  background: ${({ theme }) => theme.colors.surface.canvas};
  color: ${({ theme }) => theme.colors.text.primary};
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.accent.sage}; }
`;

const MethodRadioGroup = styled.div`
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
`;

const MethodRadioLabel = styled.label<{ $active: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 16px;
  border: 2px solid ${({ $active, theme }) =>
    $active ? theme.colors.accent.sage : theme.colors.border.subtle};
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: ${({ $active }) => ($active ? 600 : 400)};
  color: ${({ $active, theme }) =>
    $active ? theme.colors.accent.sageDeep || theme.colors.accent.sage : theme.colors.text.primary};
  background: ${({ $active, theme }) =>
    $active ? theme.colors.accent.sageSoft || '#eff6ff' : 'transparent'};
  transition: border-color 150ms ease, background 150ms ease;
  user-select: none;
`;

const FieldError = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.status.danger || '#ef4444'};
`;

const InvoiceTable = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

const Th = styled.th`
  padding: 10px 12px;
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: ${({ theme }) => theme.colors.text.secondary};
  background: ${({ theme }) => theme.colors.surface.canvas};
  border-bottom: 1px solid ${({ theme }) => theme.colors.surface.sunken};
`;

const Td = styled.td`
  padding: 12px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text.primary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.surface.raised};
  vertical-align: middle;
`;

const TdRight = styled(Td)`
  text-align: right;
  font-variant-numeric: tabular-nums;
`;

const AmountInput = styled.input`
  width: 130px;
  padding: 8px 10px;
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: 6px;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  text-align: right;
  background: ${({ theme }) => theme.colors.surface.canvas};
  color: ${({ theme }) => theme.colors.text.primary};
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.accent.sage}; }
  &[aria-invalid='true'] { border-color: ${({ theme }) => theme.colors.status.danger || '#ef4444'}; }
`;

const TotalSummary = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 20px;
  align-items: baseline;
  padding-top: 12px;
  border-top: 2px solid ${({ theme }) => theme.colors.surface.sunken};
  margin-top: 4px;
  font-size: 14px;
`;

const TotalLabel = styled.span`
  color: ${({ theme }) => theme.colors.text.secondary};
  font-weight: 500;
`;

const TotalValue = styled.span`
  font-size: 20px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text.primary};
  font-variant-numeric: tabular-nums;
`;

const InvoiceLoadingHint = styled.p`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text.secondary};
  margin: 0;
  padding: 16px 0;
`;

const EmptyInvoiceHint = styled.p`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text.secondary};
  margin: 0;
  padding: 8px 0;
`;

const ErrorBanner = styled.div`
  background: #fef2f2;
  border: 1px solid #fca5a5;
  border-radius: 8px;
  padding: 12px 16px;
  font-size: 14px;
  color: #991b1b;
  margin-bottom: 16px;
`;

const FooterRow = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 16px;
`;

const PrimaryButton = styled.button`
  padding: 11px 28px;
  background: ${({ theme }) => theme.colors.accent.sage};
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 150ms ease;
  &:hover { background: ${({ theme }) => theme.colors.accent.sageDeep}; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const GhostButton = styled.button`
  padding: 11px 24px;
  background: transparent;
  color: ${({ theme }) => theme.colors.text.secondary};
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  &:hover { background: ${({ theme }) => theme.colors.surface.raised}; }
`;

// ─── Application row state ────────────────────────────────────────────────────

interface ApplicationRow {
  apDocId: string;
  apDocNumber: string;
  invoiceDate: string;
  dueDate: string | null;
  totalGross: number;
  totalPaid: number;      // computed from existing payment applications
  outstanding: number;    // totalGross - totalPaid
  amountToApply: string;  // controlled string so user can type decimals freely
  selected: boolean;
  currency: string;
  companyCode: string;    // copied from the source invoice; used as the payment's companyCode
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function RecordPaymentPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const organizationId = user?.organizationId ?? '';

  const today_ = today();

  // ── Form state ─────────────────────────────────────────────────────────────
  const [vendorId, setVendorId] = useState('');
  const [vendorCode, setVendorCode] = useState('');
  const [paymentDate, setPaymentDate] = useState(today_);
  const [bankAccountId, setBankAccountId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('bank_transfer');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState<ApplicationRow[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [bannerError, setBannerError] = useState<string | null>(null);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const { data: vendorsData } = useVendors({
    organizationId,
    isActive: true,
    perPage: 200,
  });
  const vendors = vendorsData?.data ?? [];

  // GL accounts for bank account picker (leaf, active accounts)
  const { data: accountsData } = useFinanceAccounts(organizationId);
  const allAccounts = accountsData?.items ?? [];
  // Filter to active, non-control (leaf) accounts — typical bank accounts
  const bankAccounts = useMemo(
    () => allAccounts.filter((a) => a.isActive && !a.isControlAccount),
    [allAccounts]
  );

  // No posting-setup default here — the hook requires companyCode which we don't
  // know until vendor is selected. User picks the bank account explicitly.

  // Approved AP Invoices for selected vendor.
  // The existing useAPInvoices hook doesn't pass vendor_id; we query directly.
  const { data: apInvoicesData, isLoading: apLoading } = useQuery({
    queryKey: ['purchasing', 'ap', 'approved-for-vendor', organizationId, vendorId],
    queryFn: async () => {
      const res = await apiClient.get<PaginatedResult<APInvoice>>('/v1/purchasing/ap', {
        params: {
          organization_id: organizationId,
          vendor_id: vendorId,
          status: 'Approved',
          per_page: 100,
        },
      });
      return res.data;
    },
    enabled: !!vendorId && !!organizationId,
    staleTime: 30_000,
  });
  const approvedInvoices = apInvoicesData?.data ?? [];

  // Existing payments for vendor — used to compute outstanding amounts
  const { data: existingPaymentsData } = usePayments(
    vendorId
      ? { organizationId, vendorId, size: 200 }
      : { organizationId, size: 1 }  // minimal placeholder when no vendor
  );
  const existingPayments = existingPaymentsData?.items ?? [];

  // ── Compute outstanding amounts ────────────────────────────────────────────

  // Reason: the backend endpoint POST /finance/ap-invoices/totals-paid (built
  // in Phase D) returns per-invoice paid totals from ap_payment_applications.
  // The previous implementation left this unwired so every invoice showed up
  // even after being fully paid. We now call it with the loaded invoice docIds
  // and use the returned map directly. existingPayments is no longer the
  // source of truth for paid amounts — it's just retained for any future UI
  // affordance like showing recent payments.
  const apDocIds = useMemo(
    () => approvedInvoices.map((inv) => inv.docId),
    [approvedInvoices]
  );
  const { data: paidMapFromBackend } = useQuery({
    queryKey: ['finance', 'ap-totals-paid', organizationId, apDocIds.join(',')],
    queryFn: () =>
      getApDocTotalsPaid({
        organizationId,
        apDocIds,
      }),
    enabled: !!organizationId && apDocIds.length > 0,
    staleTime: 10_000,
  });
  const alreadyPaidMap = useMemo(
    () => paidMapFromBackend ?? new Map<string, number>(),
    [paidMapFromBackend]
  );
  // Reason: kept so the existing useQuery for payments still runs (provides
  // refetch trigger on cache invalidation from useCreatePayment). Not used
  // for math anymore.
  void existingPayments;

  // Build rows when vendor's invoices load
  useEffect(() => {
    if (!vendorId) {
      setRows([]);
      return;
    }

    const newRows: ApplicationRow[] = approvedInvoices.map((inv) => {
      const paid = alreadyPaidMap.get(inv.docId) ?? 0;
      const outstanding = Math.max(0, inv.totalGross - paid);
      return {
        apDocId: inv.docId,
        apDocNumber: inv.docNumber,
        invoiceDate: inv.invoiceDate,
        dueDate: inv.dueDate ?? null,
        totalGross: inv.totalGross,
        totalPaid: paid,
        outstanding,
        amountToApply: outstanding.toFixed(2),
        selected: false,
        currency: inv.currencyCode,
        companyCode: inv.companyCode,
      };
    });
    // Only show invoices with outstanding > 0
    setRows(newRows.filter((r) => r.outstanding > 0));
  }, [approvedInvoices, vendorId, alreadyPaidMap]);

  // ── Derived totals ─────────────────────────────────────────────────────────

  const selectedRows = rows.filter((r) => r.selected);
  const paymentTotal = useMemo(
    () => selectedRows.reduce((s, r) => s + (parseFloat(r.amountToApply) || 0), 0),
    [selectedRows]
  );

  const selectedCurrency = selectedRows[0]?.currency ?? 'AED';

  // ── Row mutation helpers ───────────────────────────────────────────────────

  const toggleRow = (apDocId: string) => {
    setRows((prev) =>
      prev.map((r) => (r.apDocId === apDocId ? { ...r, selected: !r.selected } : r))
    );
  };

  const setAmountToApply = (apDocId: string, value: string) => {
    setRows((prev) =>
      prev.map((r) => (r.apDocId === apDocId ? { ...r, amountToApply: value } : r))
    );
  };

  // ── Vendor selection handler ───────────────────────────────────────────────

  const handleVendorChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedVendorId = e.target.value;
    const selectedVendor = vendors.find((v) => v.vendorId === selectedVendorId);
    setVendorId(selectedVendorId);
    setVendorCode(selectedVendor?.vendorCode ?? '');
    setRows([]);
  };

  // ── Mutation ───────────────────────────────────────────────────────────────

  const createPaymentMutation = useCreatePayment();

  // ── Submit handler ─────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    setBannerError(null);
    const errors: Record<string, string> = {};

    if (!vendorId) errors.vendorId = 'Please select a vendor.';
    if (!paymentDate) errors.paymentDate = 'Payment date is required.';
    else if (paymentDate > today_) errors.paymentDate = 'Payment date cannot be in the future.';
    if (!bankAccountId) errors.bankAccountId = 'Bank account is required.';
    if (!paymentMethod) errors.paymentMethod = 'Payment method is required.';
    if (paymentMethod === 'cheque' && !referenceNumber.trim()) {
      errors.referenceNumber = 'Reference number is required for cheque payments.';
    }

    if (selectedRows.length === 0) {
      errors.applications = 'Select at least one invoice to pay.';
    }

    for (const r of selectedRows) {
      const amount = parseFloat(r.amountToApply);
      if (isNaN(amount) || amount <= 0) {
        errors.applications = 'Each selected invoice must have an amount > 0.';
        break;
      }
      if (amount > r.outstanding) {
        errors.applications = `Amount for ${r.apDocNumber} (${amount.toFixed(2)}) exceeds outstanding (${r.outstanding.toFixed(2)}).`;
        break;
      }
    }

    if (paymentTotal <= 0) {
      errors.applications = errors.applications ?? 'Total payment amount must be > 0.';
    }

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    // Reason: previously hardcoded 'DEFAULT' under the false assumption that
    // the backend would resolve the org's default company. It doesn't — the
    // posting setup is keyed by exact (organizationId, companyCode) match.
    // Every selected invoice belongs to the same company (you can only pay
    // one vendor per payment, and that vendor's invoices share companyCode),
    // so taking the first row's value is safe.
    const companyCode = selectedRows[0]?.companyCode ?? '1000';
    const currencyCode = selectedRows[0]?.currency ?? 'AED';

    try {
      const created = await createPaymentMutation.mutateAsync({
        organizationId,
        companyCode,
        paymentDate,
        vendorId,
        vendorCode,
        bankAccountId: bankAccountId!,
        paymentMethod,
        referenceNumber: referenceNumber.trim() || null,
        currencyCode,
        notes: notes.trim() || null,
        applications: selectedRows.map((r) => ({
          apDocId: r.apDocId,
          apDocNumber: r.apDocNumber,
          amountApplied: r.amountToApply,
          // Reason: denormalize the invoice totalGross so the backend can
          // enforce its server-side overpayment guard. Without this hint
          // the backend's guard skips entirely and over-payments are
          // accepted (see _check_no_overpayment).
          totalGross: r.totalGross,
        })),
      });
      showSuccessToast(`Payment ${created.paymentNumber} recorded successfully.`);
      navigate(`/finance/payments/${created.paymentId}`);
    } catch (err: unknown) {
      const axiosErr = err as {
        response?: { data?: { detail?: unknown }; status?: number };
        message?: string;
      };
      const detail = axiosErr?.response?.data?.detail;
      if (Array.isArray(detail)) {
        const parsed = parseApiErrors(detail as ApiErrorItem[], API_FIELD_MAP);
        const { __banner__, ...rest } = parsed;
        setFieldErrors(rest);
        if (__banner__) setBannerError(__banner__);
      } else if (typeof detail === 'string') {
        setBannerError(detail);
      } else {
        setBannerError(
          (axiosErr?.message as string | undefined) ?? 'Failed to record payment. Please try again.'
        );
      }
    }
  };

  const isSaving = createPaymentMutation.isPending;

  return (
    <Container>
      <BackLink onClick={() => navigate('/finance/payments')}>&larr; Back to Payments</BackLink>
      <Title>Record Vendor Payment</Title>

      {bannerError && (
        <ErrorBanner role="alert">{bannerError}</ErrorBanner>
      )}

      {/* Vendor + Header */}
      <Card>
        <CardTitle>Payment Header</CardTitle>

        <FormRow>
          <Field>
            <Label htmlFor="vendor-select">Vendor *</Label>
            <Select
              id="vendor-select"
              value={vendorId}
              onChange={handleVendorChange}
              aria-invalid={!!fieldErrors.vendorId}
              aria-describedby={fieldErrors.vendorId ? 'vendor-error' : undefined}
            >
              <option value="">— Select vendor —</option>
              {vendors.map((v) => (
                <option key={v.vendorId} value={v.vendorId}>
                  {v.vendorCode} — {v.name}
                </option>
              ))}
            </Select>
            {fieldErrors.vendorId && (
              <FieldError id="vendor-error" role="alert">{fieldErrors.vendorId}</FieldError>
            )}
          </Field>

          <Field>
            <Label htmlFor="payment-date">Payment Date *</Label>
            <Input
              id="payment-date"
              type="date"
              value={paymentDate}
              max={today_}
              onChange={(e) => setPaymentDate(e.target.value)}
              aria-invalid={!!fieldErrors.paymentDate}
              aria-describedby={fieldErrors.paymentDate ? 'paymentDate-error' : undefined}
            />
            {fieldErrors.paymentDate && (
              <FieldError id="paymentDate-error" role="alert">{fieldErrors.paymentDate}</FieldError>
            )}
          </Field>
        </FormRow>

        <FormRow>
          <Field>
            <Label htmlFor="bank-account">Bank Account *</Label>
            <AccountCombobox
              id="bank-account"
              valueAccountId={bankAccountId}
              accounts={bankAccounts}
              onChange={(id) => setBankAccountId(id)}
              placeholder="— Select bank account —"
              hasError={!!fieldErrors.bankAccountId}
              describedBy={fieldErrors.bankAccountId ? 'bankAccountId-error' : undefined}
            />
            {fieldErrors.bankAccountId && (
              <FieldError id="bankAccountId-error" role="alert">{fieldErrors.bankAccountId}</FieldError>
            )}
          </Field>

          <Field>
            <Label htmlFor="reference-number">
              Reference Number
              {paymentMethod === 'cheque' && ' *'}
            </Label>
            <Input
              id="reference-number"
              type="text"
              placeholder={paymentMethod === 'cheque' ? 'Cheque number (required)' : 'Optional'}
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              aria-invalid={!!fieldErrors.referenceNumber}
              aria-describedby={fieldErrors.referenceNumber ? 'referenceNumber-error' : undefined}
            />
            {fieldErrors.referenceNumber && (
              <FieldError id="referenceNumber-error" role="alert">{fieldErrors.referenceNumber}</FieldError>
            )}
          </Field>
        </FormRow>

        <Field style={{ marginBottom: 0 }}>
          <Label>Payment Method *</Label>
          <MethodRadioGroup role="radiogroup" aria-label="Payment method">
            {(
              [
                ['bank_transfer', 'Bank Transfer'],
                ['cheque', 'Cheque'],
                ['cash', 'Cash'],
              ] as const
            ).map(([value, label]) => (
              <MethodRadioLabel
                key={value}
                $active={paymentMethod === value}
                htmlFor={`method-${value}`}
              >
                <input
                  id={`method-${value}`}
                  type="radio"
                  name="paymentMethod"
                  value={value}
                  checked={paymentMethod === value}
                  onChange={() => setPaymentMethod(value)}
                  style={{ accentColor: 'currentColor' }}
                />
                {label}
              </MethodRadioLabel>
            ))}
          </MethodRadioGroup>
          {fieldErrors.paymentMethod && (
            <FieldError role="alert">{fieldErrors.paymentMethod}</FieldError>
          )}
        </Field>
      </Card>

      {/* Invoices to pay */}
      <Card>
        <CardTitle>
          Invoices to Pay
          {vendorId && approvedInvoices.length > 0 && (
            <span style={{ fontWeight: 400, fontSize: 13, marginLeft: 8, color: '#6b7280' }}>
              — {rows.length} outstanding invoice{rows.length !== 1 ? 's' : ''}
            </span>
          )}
        </CardTitle>

        {!vendorId && (
          <EmptyInvoiceHint>
            Select a vendor above to see their approved invoices.
          </EmptyInvoiceHint>
        )}

        {vendorId && apLoading && (
          <InvoiceLoadingHint>Loading approved invoices...</InvoiceLoadingHint>
        )}

        {vendorId && !apLoading && rows.length === 0 && (
          <EmptyInvoiceHint>
            No outstanding approved invoices found for this vendor.
          </EmptyInvoiceHint>
        )}

        {vendorId && !apLoading && rows.length > 0 && (
          <>
            <InvoiceTable>
              <thead>
                <tr>
                  <Th style={{ width: 44 }}>
                    <input
                      type="checkbox"
                      aria-label="Select all invoices"
                      checked={rows.length > 0 && rows.every((r) => r.selected)}
                      onChange={(e) => {
                        setRows((prev) =>
                          prev.map((r) => ({ ...r, selected: e.target.checked }))
                        );
                      }}
                    />
                  </Th>
                  <Th>Doc Number</Th>
                  <Th>Invoice Date</Th>
                  <Th>Due Date</Th>
                  <Th style={{ textAlign: 'right' }}>Total Gross</Th>
                  <Th style={{ textAlign: 'right' }}>Total Paid</Th>
                  <Th style={{ textAlign: 'right', color: '#059669' }}>Outstanding</Th>
                  <Th style={{ textAlign: 'right' }}>Amount to Apply *</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const amountVal = parseFloat(row.amountToApply) || 0;
                  const isOverpay = amountVal > row.outstanding;
                  return (
                    <tr key={row.apDocId}>
                      <Td style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={row.selected}
                          onChange={() => toggleRow(row.apDocId)}
                          aria-label={`Select invoice ${row.apDocNumber}`}
                        />
                      </Td>
                      <Td>
                        <code style={{ fontWeight: 600, fontSize: 13 }}>{row.apDocNumber}</code>
                      </Td>
                      <Td style={{ fontSize: 13 }}>{formatDate(row.invoiceDate)}</Td>
                      <Td style={{ fontSize: 13, color: row.dueDate && row.dueDate < today_ ? '#dc2626' : 'inherit' }}>
                        {formatDate(row.dueDate)}
                      </Td>
                      <TdRight style={{ fontSize: 13 }}>
                        {formatCurrency(row.totalGross, row.currency)}
                      </TdRight>
                      <TdRight style={{ fontSize: 13, color: '#6b7280' }}>
                        {row.totalPaid > 0 ? formatCurrency(row.totalPaid, row.currency) : '—'}
                      </TdRight>
                      <TdRight style={{ fontSize: 13, fontWeight: 600, color: '#059669' }}>
                        {formatCurrency(row.outstanding, row.currency)}
                      </TdRight>
                      <Td style={{ textAlign: 'right' }}>
                        <AmountInput
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={row.amountToApply}
                          disabled={!row.selected}
                          onChange={(e) => setAmountToApply(row.apDocId, e.target.value)}
                          aria-label={`Amount to apply for ${row.apDocNumber}`}
                          aria-invalid={row.selected && isOverpay}
                          title={
                            row.selected && isOverpay
                              ? `Cannot exceed outstanding amount of ${row.outstanding.toFixed(2)}`
                              : undefined
                          }
                          style={{
                            borderColor: row.selected && isOverpay ? '#ef4444' : undefined,
                          }}
                        />
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </InvoiceTable>

            {fieldErrors.applications && (
              <FieldError role="alert" style={{ display: 'block', marginTop: 8 }}>
                {fieldErrors.applications}
              </FieldError>
            )}

            <TotalSummary>
              <TotalLabel>
                Total Payment ({selectedRows.length} invoice{selectedRows.length !== 1 ? 's' : ''})
              </TotalLabel>
              <TotalValue>
                {formatCurrency(paymentTotal, selectedCurrency)}
              </TotalValue>
            </TotalSummary>
          </>
        )}
      </Card>

      {/* Notes */}
      <Card>
        <CardTitle>Notes</CardTitle>
        <Field>
          <Label htmlFor="payment-notes">Notes (optional)</Label>
          <Textarea
            id="payment-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Payment instructions, bank transfer details, cheque notes..."
          />
        </Field>
      </Card>

      <FooterRow>
        <GhostButton type="button" onClick={() => navigate('/finance/payments')}>
          Cancel
        </GhostButton>
        <PrimaryButton
          type="button"
          onClick={handleSubmit}
          disabled={isSaving}
          aria-busy={isSaving}
        >
          {isSaving ? 'Recording...' : 'Record Payment'}
        </PrimaryButton>
      </FooterRow>
    </Container>
  );
}
