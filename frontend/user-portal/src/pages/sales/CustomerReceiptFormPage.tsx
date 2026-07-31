/**
 * CustomerReceiptFormPage — Wave 3 (T-200.1)
 *
 * Shared form page for creating, editing, and "from-invoice" Customer Receipts.
 *
 * Three modes (determined by URL params):
 *   new                        — no special params → direct create with manual allocations
 *   from-invoice/:ariDocEntry  — pre-fill customer/currency from the ARI
 *   :docId/edit                — update an existing DRAFT receipt
 *
 * Submit creates/updates the doc in DRAFT status. Status transition (DRAFT → OPEN)
 * is a separate action on the detail page action bar.
 *
 * Reuses:
 *   - CustomerCombobox (typeahead customer selector)
 *   - AccountCombobox (bank account selection, ASSETS drawer)
 *
 * Rule 1: API path does NOT include /api/ prefix.
 * Rule 2: backend now returns camelCase — all field names match.
 * Rule 3: status comparisons use lowercase literals.
 * Rule 4: NO Audit History button.
 *
 * Modals do NOT close on overlay click — X button only (project rule).
 * Route: /sales/customer-receipts/new
 *         /sales/customer-receipts/from-invoice/:ariDocEntry
 *         /sales/customer-receipts/:docId/edit
 */

import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import styled, { useTheme } from 'styled-components';
import { Trash2, Plus } from 'lucide-react';
import { glassPanel, glassControl, monoLabel } from '@a64core/shared';
import { useAuthStore } from '../../stores/auth.store';
import {
  useCustomerReceipt,
  useCreateCustomerReceipt,
  useCreateCustomerReceiptFromInvoice,
  useUpdateCustomerReceipt,
} from '../../hooks/queries/useCustomerReceipts';
import { useArInvoice } from '../../hooks/queries/useArInvoices';
import { useFinanceAccounts } from '../../hooks/queries/useFinanceAccounts';
import { CustomerCombobox } from '../../components/sales/CustomerCombobox';
import { AccountCombobox } from '../../components/finance/AccountCombobox';
import { CurrencyCombobox } from '../../components/sales/CurrencyCombobox';
import { CompanyCombobox, shouldShowCompanyField } from '../../components/sales/CompanyCombobox';
import { useTenantBaseCurrency } from '../../hooks/queries/useTenantBaseCurrency';
import { useCompanies } from '../../hooks/queries/useCompanies';
import type { Customer } from '../../types/crm';

// ─── Zod schema ───────────────────────────────────────────────────────────────

const allocationSchema = z.object({
  arInvoiceDocEntry: z.string().min(1, 'AR Invoice doc entry required'),
  arInvoiceDocNumber: z.string().min(1, 'AR Invoice doc number required'),
  amountApplied: z.coerce.number().positive('Must be > 0'),
  notes: z.string().nullable().optional(),
});

const formSchema = z.object({
  companyCode: z.string().optional().default(''),
  customerId: z.string().min(1, 'Customer required'),
  customerName: z.string().min(1, 'Customer name required'),
  bpRefNo: z.string().nullable().optional(),
  docDate: z.string().min(1, 'Doc date required'),
  paymentMethod: z.enum(['bank_transfer', 'cheque', 'cash', 'card'], {
    errorMap: () => ({ message: 'Payment method required' }),
  }),
  paymentRef: z.string().nullable().optional(),
  bankAccountId: z.string().min(1, 'Bank account required'),
  currency: z.string().default('AED'),
  exchangeRate: z.coerce.number().positive().default(1),
  amountReceived: z.coerce.number().positive('Amount must be > 0'),
  allocations: z.array(allocationSchema).min(1, 'At least one allocation required'),
  journalMemo: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

type FormData = z.infer<typeof formSchema>;

// ─── Styled components ────────────────────────────────────────────────────────

const Container = styled.div`
  padding: 32px;
  max-width: 1280px;
  margin: 0 auto;
`;

const BackLink = styled.button`
  background: none;
  border: none;
  color: ${({ theme }) => theme.colors.celeste};
  font-size: 14px;
  cursor: pointer;
  padding: 0;
  margin-bottom: 20px;
  &:hover {
    text-decoration: underline;
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

const PageTitle = styled.h1`
  font-size: 26px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 32px 0;
`;

const Card = styled.div`
  ${glassPanel}
  padding: 24px;
  margin-bottom: 24px;
`;

const CardTitle = styled.h2`
  font-size: 16px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 20px 0;
`;

const FormGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;

  @media (max-width: 1024px) {
    grid-template-columns: repeat(2, 1fr);
  }

  @media (max-width: 600px) {
    grid-template-columns: 1fr;
  }
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const FieldFull = styled(Field)`
  grid-column: 1 / -1;
`;

const Label = styled.label`
  ${monoLabel}
  color: ${({ theme }) => theme.colors.celeste};
`;

const Input = styled.input<{ $hasError?: boolean }>`
  ${glassControl}
  padding: 10px 12px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  border-color: ${({ $hasError, theme }) => ($hasError ? theme.colors.bright.coral : theme.colors.glass.border)};
  &::placeholder { color: ${({ theme }) => theme.colors.muted}; }
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
  &:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }
`;

const Select = styled.select<{ $hasError?: boolean }>`
  ${glassControl}
  padding: 10px 12px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  border-color: ${({ $hasError, theme }) => ($hasError ? theme.colors.bright.coral : theme.colors.glass.border)};
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
  option {
    background: ${({ theme }) => theme.colors.cosmosHi};
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

const Textarea = styled.textarea`
  ${glassControl}
  padding: 10px 12px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  resize: vertical;
  min-height: 80px;
  &::placeholder { color: ${({ theme }) => theme.colors.muted}; }
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
`;

const FieldError = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.bright.coral};
`;

const AllocTable = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

const AllocTh = styled.th`
  ${monoLabel}
  padding: 10px 12px;
  text-align: left;
  color: ${({ theme }) => theme.colors.celeste};
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
`;

const AllocThRight = styled(AllocTh)`
  text-align: right;
`;

const AllocTd = styled.td`
  padding: 8px 12px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  vertical-align: middle;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const SmallInput = styled.input<{ $hasError?: boolean }>`
  ${glassControl}
  width: 100%;
  padding: 6px 8px;
  font-size: 13px;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  color: ${({ theme }) => theme.colors.textPrimary};
  border-color: ${({ $hasError, theme }) => ($hasError ? theme.colors.bright.coral : theme.colors.glass.border)};
  &::placeholder { color: ${({ theme }) => theme.colors.muted}; }
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
`;

// Destructive — coral-b tinted glass, never solid red (spec §4).
const IconButton = styled.button`
  background: rgba(240, 138, 112, 0.16);
  border: 1px solid rgba(240, 138, 112, 0.45);
  padding: 4px;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.bright.coral};
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 150ms ease;
  &:hover {
    background: rgba(240, 138, 112, 0.26);
  }
`;

// Ghost/ancillary button — transparent, celeste text/border (spec §4).
const AddRowButton = styled.button`
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: 8px;
  padding: 8px 16px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.celeste};
  cursor: pointer;
  width: 100%;
  justify-content: center;
  transition: all 150ms ease;
  &:hover {
    background: rgba(180, 200, 220, 0.07);
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

const ActionRow = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
`;

// Primary CTA — the ONE gold budget item on this page (spec §3/§4).
const PrimaryButton = styled.button`
  padding: 11px 24px;
  background: linear-gradient(145deg, ${({ theme }) => theme.colors.secondary[500]}, ${({ theme }) => theme.colors.secondary[600]});
  color: ${({ theme }) => theme.colors.onAccent};
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 150ms ease, box-shadow 150ms ease;
  box-shadow: 0 4px 14px rgba(4, 6, 18, 0.35);
  &:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 6px 20px rgba(4, 6, 18, 0.45), 0 0 16px rgba(220, 185, 79, 0.25);
  }
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const SecondaryButton = styled.button`
  ${glassControl}
  padding: 11px 24px;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 150ms ease;
  &:hover {
    background: ${({ theme }) => theme.colors.glass.hi};
  }
`;

const ErrorBanner = styled.div`
  background: ${({ theme }) => theme.colors.errorBg};
  border: 1px solid rgba(240, 138, 112, 0.45);
  color: ${({ theme }) => theme.colors.bright.coral};
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 20px;
  font-size: 14px;
`;

const InfoBanner = styled.div`
  background: ${({ theme }) => theme.colors.infoBg};
  color: ${({ theme }) => theme.colors.bright.lapis};
  border: 1px solid rgba(107, 138, 224, 0.45);
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 20px;
  font-size: 14px;
`;

const SumRow = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 10px 12px;
  font-size: 14px;
  font-weight: 600;
  border-top: 1px solid ${({ theme }) => theme.colors.line};
  margin-top: 4px;
`;

const SumLabel = styled.span`
  color: ${({ theme }) => theme.colors.celeste};
`;

const SumValue = styled.span<{ $hasError?: boolean }>`
  color: ${({ $hasError, theme }) =>
    $hasError ? theme.colors.bright.coral : theme.colors.textPrimary};
  font-variant-numeric: tabular-nums;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  min-width: 120px;
  text-align: right;
`;

// ─── Component ────────────────────────────────────────────────────────────────

export function CustomerReceiptFormPage() {
  const theme = useTheme();
  const navigate = useNavigate();
  // from-invoice mode uses ariDocEntry; edit mode uses docId
  const { ariDocEntry, docId } = useParams<{ ariDocEntry?: string; docId?: string }>();
  const { user } = useAuthStore();
  const orgId = user?.organizationId ?? '';

  const isFromInvoice = Boolean(ariDocEntry);
  const isEditMode = Boolean(docId);

  // Companies — for CompanyCombobox
  const { data: companies = [], isLoading: companiesLoading } = useCompanies(orgId);
  const showCompanyField = shouldShowCompanyField(companies, companiesLoading);

  // Load existing receipt for edit mode
  const { data: existingReceipt, isLoading: receiptLoading } = useCustomerReceipt(
    isEditMode ? docId : undefined,
    orgId,
  );

  // Load ARI for from-invoice mode
  const { data: sourceARI, isLoading: ariLoading } = useArInvoice(
    isFromInvoice ? ariDocEntry : undefined,
    orgId,
  );

  // GL accounts for bank account picker (ASSETS drawer, leaf accounts)
  const { data: accountsData } = useFinanceAccounts(orgId);
  const bankAccounts = useMemo(() => {
    const all = accountsData?.items ?? [];
    return all.filter((a) => !a.isHeader && a.isActive);
  }, [accountsData]);

  const createMutation = useCreateCustomerReceipt();
  const fromInvoiceMutation = useCreateCustomerReceiptFromInvoice();
  const updateMutation = useUpdateCustomerReceipt();

  const [submitError, setSubmitError] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      companyCode: '',
      customerId: '',
      customerName: '',
      bpRefNo: null,
      docDate: today,
      paymentMethod: 'bank_transfer',
      paymentRef: null,
      bankAccountId: '',
      currency: 'AED',
      exchangeRate: 1,
      amountReceived: 0,
      allocations: [],
      journalMemo: null,
      notes: null,
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'allocations' });

  const watchAllocations = watch('allocations');
  const watchAmountReceived = watch('amountReceived');

  // Exchange rate visibility
  const baseCurrency = useTenantBaseCurrency();
  const watchedCurrency = watch('currency');
  const showExchangeRate = watchedCurrency !== baseCurrency;

  // Reset exchangeRate to 1.0 when currency reverts to base.
  useEffect(() => {
    if (!showExchangeRate) {
      setValue('exchangeRate', 1);
    }
  }, [showExchangeRate, setValue]);

  const allocationSum = useMemo(
    () =>
      (watchAllocations || []).reduce(
        (sum, a) => sum + (Number(a.amountApplied) || 0),
        0,
      ),
    [watchAllocations],
  );

  const sumMatchesAmount = Math.abs(allocationSum - (Number(watchAmountReceived) || 0)) < 0.01;

  // Pre-fill form when loading existing receipt (edit mode)
  useEffect(() => {
    if (isEditMode && existingReceipt) {
      const dateStr = existingReceipt.docDate?.slice(0, 10) ?? today;
      reset({
        companyCode: existingReceipt.companyCode ?? '',
        customerId: existingReceipt.customerId,
        customerName: existingReceipt.customerName,
        bpRefNo: existingReceipt.bpRefNo ?? null,
        docDate: dateStr,
        paymentMethod: existingReceipt.paymentMethod as FormData['paymentMethod'],
        paymentRef: existingReceipt.paymentRef ?? null,
        bankAccountId: existingReceipt.bankAccountId,
        currency: existingReceipt.currency ?? 'AED',
        exchangeRate: Number(existingReceipt.exchangeRate) || 1,
        amountReceived: Number(existingReceipt.amountReceived),
        allocations: existingReceipt.allocations.map((a) => ({
          arInvoiceDocEntry: a.arInvoiceDocEntry,
          arInvoiceDocNumber: a.arInvoiceDocNumber,
          amountApplied: Number(a.amountApplied),
          notes: a.notes ?? null,
        })),
        journalMemo: existingReceipt.journalMemo ?? null,
        notes: existingReceipt.notes ?? null,
      });
    }
  }, [isEditMode, existingReceipt, reset, today]);

  // Pre-fill from AR Invoice (from-invoice mode)
  useEffect(() => {
    if (isFromInvoice && sourceARI) {
      const openAmount = Number(sourceARI.totals.openAmount);
      reset({
        companyCode: sourceARI.companyCode ?? '',
        customerId: sourceARI.customerId,
        customerName: sourceARI.customerName,
        bpRefNo: null,
        docDate: today,
        paymentMethod: 'bank_transfer',
        paymentRef: null,
        bankAccountId: '',
        currency: sourceARI.currency ?? 'AED',
        exchangeRate: Number(sourceARI.exchangeRate) || 1,
        amountReceived: openAmount,
        allocations: [
          {
            arInvoiceDocEntry: sourceARI.docEntry,
            arInvoiceDocNumber: sourceARI.docNumber,
            amountApplied: openAmount,
            notes: null,
          },
        ],
        journalMemo: null,
        notes: null,
      });
    }
  }, [isFromInvoice, sourceARI, reset, today]);

  const onSubmit = async (formData: FormData) => {
    setSubmitError(null);
    try {
      if (isEditMode && docId) {
        const result = await updateMutation.mutateAsync({
          docId,
          data: {
            bpRefNo: formData.bpRefNo,
            docDate: formData.docDate,
            paymentMethod: formData.paymentMethod,
            paymentRef: formData.paymentRef,
            bankAccountId: formData.bankAccountId,
            currency: formData.currency,
            exchangeRate: formData.exchangeRate,
            amountReceived: formData.amountReceived,
            allocations: formData.allocations.map((a) => ({
              arInvoiceDocEntry: a.arInvoiceDocEntry,
              arInvoiceDocNumber: a.arInvoiceDocNumber,
              amountApplied: a.amountApplied,
              notes: a.notes ?? null,
            })),
            journalMemo: formData.journalMemo,
            notes: formData.notes,
          },
          orgId,
        });
        navigate(`/sales/customer-receipts/${result.docEntry}`);
        return;
      }

      if (isFromInvoice && ariDocEntry) {
        // Use the from-invoice shortcut endpoint
        const result = await fromInvoiceMutation.mutateAsync({
          ariDocEntry,
          data: {
            companyCode: formData.companyCode,
            docDate: formData.docDate,
            paymentMethod: formData.paymentMethod,
            paymentRef: formData.paymentRef ?? null,
            bankAccountId: formData.bankAccountId,
            currency: formData.currency,
            exchangeRate: formData.exchangeRate,
            amount: formData.amountReceived,
            bpRefNo: formData.bpRefNo ?? null,
            journalMemo: formData.journalMemo ?? null,
            notes: formData.notes ?? null,
          },
          orgId,
        });
        navigate(`/sales/customer-receipts/${result.docEntry}`);
        return;
      }

      // New (manual allocations)
      const result = await createMutation.mutateAsync({
        data: {
          companyCode: formData.companyCode,
          customerId: formData.customerId,
          customerName: formData.customerName,
          bpRefNo: formData.bpRefNo ?? null,
          docDate: formData.docDate,
          paymentMethod: formData.paymentMethod,
          paymentRef: formData.paymentRef ?? null,
          bankAccountId: formData.bankAccountId,
          currency: formData.currency,
          exchangeRate: formData.exchangeRate,
          amountReceived: formData.amountReceived,
          allocations: formData.allocations.map((a) => ({
            arInvoiceDocEntry: a.arInvoiceDocEntry,
            arInvoiceDocNumber: a.arInvoiceDocNumber,
            amountApplied: a.amountApplied,
            notes: a.notes ?? null,
          })),
          journalMemo: formData.journalMemo ?? null,
          notes: formData.notes ?? null,
        },
        orgId,
      });
      navigate(`/sales/customer-receipts/${result.docEntry}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to save Customer Receipt.');
    }
  };

  const isLoading = (isEditMode && receiptLoading) || (isFromInvoice && ariLoading);

  if (isLoading) {
    return (
      <Container>
        <BackLink onClick={() => navigate('/sales/customer-receipts')}>
          ← Customer Receipts
        </BackLink>
        <div style={{ textAlign: 'center', padding: '64px', color: theme.colors.textDisabled }}>
          Loading…
        </div>
      </Container>
    );
  }

  const pageTitle = isEditMode
    ? `Edit Receipt ${existingReceipt?.docNumber ?? ''}`
    : isFromInvoice
      ? `Receive Payment — ${sourceARI?.docNumber ?? ''}`
      : 'New Customer Receipt';

  return (
    <Container>
      <BackLink onClick={() => navigate('/sales/customer-receipts')} aria-label="Back to Customer Receipts">
        ← Customer Receipts
      </BackLink>

      <PageTitle>{pageTitle}</PageTitle>

      {isFromInvoice && sourceARI && (
        <InfoBanner>
          Pre-filled from AR Invoice <strong>{sourceARI.docNumber}</strong> —{' '}
          Customer: <strong>{sourceARI.customerName}</strong> · Open:{' '}
          <strong>
            {Number(sourceARI.totals.openAmount).toLocaleString('en-AE', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{' '}
            {sourceARI.currency}
          </strong>
        </InfoBanner>
      )}

      {submitError && <ErrorBanner>{submitError}</ErrorBanner>}

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        {/* ── Header ── */}
        <Card>
          <CardTitle>Receipt Details</CardTitle>
          <FormGrid>
            {/* Customer */}
            <Field>
              <Label htmlFor="customer-field">Customer *</Label>
              <Controller
                control={control}
                name="customerId"
                render={({ field }) => (
                  <CustomerCombobox
                    valueCustomerId={field.value || null}
                    valueCustomerName={watch('customerName') || ''}
                    onCustomerSelect={(c: Customer) => {
                      setValue('customerId', c.id);
                      setValue('customerName', c.name);
                    }}
                    onClear={() => {
                      setValue('customerId', '');
                      setValue('customerName', '');
                    }}
                    error={errors.customerId?.message}
                    disabled={isFromInvoice}
                  />
                )}
              />
              {/* CustomerCombobox renders errors.customerId internally via its
                  `error` prop (role="alert") — no external FieldError needed
                  (was duplicating). */}
            </Field>

            {/* Doc Date */}
            <Field>
              <Label htmlFor="doc-date">Receipt Date *</Label>
              <Input
                id="doc-date"
                type="date"
                $hasError={Boolean(errors.docDate)}
                {...register('docDate')}
              />
              {errors.docDate && (
                <FieldError role="alert">{errors.docDate.message}</FieldError>
              )}
            </Field>

            {/* Payment Method */}
            <Field>
              <Label htmlFor="payment-method">Payment Method *</Label>
              <Select
                id="payment-method"
                $hasError={Boolean(errors.paymentMethod)}
                {...register('paymentMethod')}
              >
                <option value="bank_transfer">Bank Transfer</option>
                <option value="cheque">Cheque</option>
                <option value="cash">Cash</option>
                <option value="card">Card</option>
              </Select>
              {errors.paymentMethod && (
                <FieldError role="alert">{errors.paymentMethod.message}</FieldError>
              )}
            </Field>

            {/* Bank Account */}
            <Field>
              <Label htmlFor="bank-account">Bank Account *</Label>
              <Controller
                control={control}
                name="bankAccountId"
                render={({ field }) => (
                  <AccountCombobox
                    id="bank-account"
                    valueAccountId={field.value || null}
                    accounts={bankAccounts}
                    onChange={(id) => field.onChange(id ?? '')}
                    placeholder="— Select bank account —"
                    hasError={Boolean(errors.bankAccountId)}
                  />
                )}
              />
              {errors.bankAccountId && (
                <FieldError role="alert">{errors.bankAccountId.message}</FieldError>
              )}
            </Field>

            {/* Currency */}
            <Field>
              <Label htmlFor="currency">Currency</Label>
              <Controller
                name="currency"
                control={control}
                render={({ field }) => (
                  <CurrencyCombobox
                    value={field.value}
                    onChange={field.onChange}
                    disabled={isSubmitting}
                    hasError={Boolean(errors.currency)}
                  />
                )}
              />
            </Field>

            {/* Exchange Rate — only when currency differs from base */}
            {showExchangeRate && (
              <Field>
                <Label htmlFor="exchange-rate">Exchange Rate</Label>
                <Input
                  id="exchange-rate"
                  type="number"
                  step="0.0001"
                  {...register('exchangeRate')}
                />
              </Field>
            )}

            {/* Amount Received */}
            <Field>
              <Label htmlFor="amount-received">Amount Received *</Label>
              <Input
                id="amount-received"
                type="number"
                step="0.01"
                $hasError={Boolean(errors.amountReceived)}
                {...register('amountReceived')}
              />
              {errors.amountReceived && (
                <FieldError role="alert">{errors.amountReceived.message}</FieldError>
              )}
            </Field>

            {/* Payment Reference */}
            <Field>
              <Label htmlFor="payment-ref">Payment Reference</Label>
              <Input
                id="payment-ref"
                type="text"
                placeholder="Transfer ref / cheque number…"
                {...register('paymentRef')}
              />
            </Field>

            {/* BP Ref No */}
            <Field>
              <Label htmlFor="bp-ref-no">Customer Reference</Label>
              <Input
                id="bp-ref-no"
                type="text"
                placeholder="Customer's own reference…"
                {...register('bpRefNo')}
              />
            </Field>

            {/* Company Code — hidden for single-company orgs, picker for multi.
                The Controller is always mounted so the CompanyCombobox useEffect
                can silently auto-set the value for single-company orgs even when
                the FieldGroup is not visible. */}
            <Controller
              control={control}
              name="companyCode"
              render={({ field }) => (
                showCompanyField ? (
                  <Field>
                    <Label htmlFor="companyCode">Company Code *</Label>
                    <CompanyCombobox
                      value={field.value}
                      onChange={field.onChange}
                      orgId={orgId}
                      disabled={isFromInvoice}
                      hasError={Boolean(errors.companyCode)}
                      describedBy={errors.companyCode ? 'companyCode-error' : undefined}
                    />
                    {errors.companyCode && (
                      <FieldError id="companyCode-error">{errors.companyCode.message}</FieldError>
                    )}
                  </Field>
                ) : (
                  // Single-company: renders null (no DOM output) but the
                  // useEffect inside CompanyCombobox still fires onChange.
                  <CompanyCombobox
                    value={field.value}
                    onChange={field.onChange}
                    orgId={orgId}
                  />
                )
              )}
            />

            {/* Journal Memo */}
            <Field>
              <Label htmlFor="journal-memo">Journal Memo</Label>
              <Input
                id="journal-memo"
                type="text"
                placeholder="Optional GL memo…"
                {...register('journalMemo')}
              />
            </Field>

            {/* Notes */}
            <FieldFull>
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" placeholder="Free-text notes…" {...register('notes')} />
            </FieldFull>
          </FormGrid>
        </Card>

        {/* ── Allocations ── */}
        {!isFromInvoice && (
          <Card>
            <CardTitle>AR Invoice Allocations</CardTitle>
            <p
              style={{
                fontSize: '13px',
                color: theme.colors.textSecondary,
                marginBottom: '16px',
                marginTop: 0,
              }}
            >
              Each row allocates a portion of the received amount to an AR Invoice.
              The sum of allocated amounts must equal the Amount Received.
            </p>
            <div style={{ overflowX: 'auto' }}>
              <AllocTable>
                <thead>
                  <tr>
                    <AllocTh>AR Invoice Doc Entry (UUID)</AllocTh>
                    <AllocTh>AR Invoice Doc Number</AllocTh>
                    <AllocThRight>Amount Applied</AllocThRight>
                    <AllocTh>Notes</AllocTh>
                    <AllocTh aria-label="Remove row" />
                  </tr>
                </thead>
                <tbody>
                  {fields.map((field, index) => (
                    <tr key={field.id}>
                      <AllocTd>
                        <SmallInput
                          type="text"
                          placeholder="UUID…"
                          $hasError={Boolean(errors.allocations?.[index]?.arInvoiceDocEntry)}
                          {...register(`allocations.${index}.arInvoiceDocEntry`)}
                        />
                      </AllocTd>
                      <AllocTd>
                        <SmallInput
                          type="text"
                          placeholder="ARI-2026-0001"
                          $hasError={Boolean(errors.allocations?.[index]?.arInvoiceDocNumber)}
                          {...register(`allocations.${index}.arInvoiceDocNumber`)}
                        />
                      </AllocTd>
                      <AllocTd style={{ textAlign: 'right' }}>
                        <SmallInput
                          type="number"
                          step="0.01"
                          style={{ textAlign: 'right' }}
                          $hasError={Boolean(errors.allocations?.[index]?.amountApplied)}
                          {...register(`allocations.${index}.amountApplied`)}
                        />
                      </AllocTd>
                      <AllocTd>
                        <SmallInput
                          type="text"
                          placeholder="Optional…"
                          {...register(`allocations.${index}.notes`)}
                        />
                      </AllocTd>
                      <AllocTd>
                        <IconButton
                          type="button"
                          onClick={() => remove(index)}
                          aria-label={`Remove allocation ${index + 1}`}
                        >
                          <Trash2 size={14} />
                        </IconButton>
                      </AllocTd>
                    </tr>
                  ))}
                </tbody>
              </AllocTable>
            </div>

            <AddRowButton
              type="button"
              onClick={() =>
                append({
                  arInvoiceDocEntry: '',
                  arInvoiceDocNumber: '',
                  amountApplied: 0,
                  notes: null,
                })
              }
              aria-label="Add allocation row"
            >
              <Plus size={14} /> Add Allocation
            </AddRowButton>

            {errors.allocations?.root && (
              <FieldError role="alert" style={{ display: 'block', marginTop: '8px' }}>
                {errors.allocations.root.message}
              </FieldError>
            )}

            {/* Sum check */}
            <SumRow>
              <SumLabel>Allocation Sum:</SumLabel>
              <SumValue $hasError={!sumMatchesAmount && allocationSum > 0}>
                {allocationSum.toLocaleString('en-AE', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </SumValue>
            </SumRow>
            {!sumMatchesAmount && allocationSum > 0 && Number(watchAmountReceived) > 0 && (
              <FieldError role="alert" style={{ display: 'block', textAlign: 'right' }}>
                Allocation sum must equal Amount Received (
                {Number(watchAmountReceived).toLocaleString('en-AE', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
                ).
              </FieldError>
            )}
          </Card>
        )}

        <ActionRow>
          <SecondaryButton
            type="button"
            onClick={() => navigate('/sales/customer-receipts')}
          >
            Cancel
          </SecondaryButton>
          <PrimaryButton
            type="submit"
            disabled={isSubmitting || createMutation.isPending || updateMutation.isPending || fromInvoiceMutation.isPending}
          >
            {isSubmitting || createMutation.isPending || updateMutation.isPending || fromInvoiceMutation.isPending
              ? 'Saving…'
              : isEditMode
                ? 'Save Changes'
                : 'Create Receipt'}
          </PrimaryButton>
        </ActionRow>
      </form>
    </Container>
  );
}

export default CustomerReceiptFormPage;
