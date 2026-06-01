/**
 * ARInvoiceFormPage — Wave 3 (T-200.0)
 *
 * Shared form page for creating, editing, and "copy-from-Delivery" AR Invoices.
 *
 * Three modes (determined by URL params):
 *   new              — no params → direct create
 *   from-delivery    — has deliveryDocId URL param → copy-from-delivery create
 *   edit             — has docId param (from /ar-invoices/:docId/edit) → update
 *
 * Submit creates the doc in DRAFT status. Status transition (DRAFT → OPEN)
 * is a separate action on the detail page action bar.
 *
 * Reuses:
 *   - CustomerCombobox (typeahead customer selector)
 *   - useTaxCodes (tax code dropdown)
 *
 * Modals do NOT close on overlay click — X button only (project rule).
 * Route: /sales/ar-invoices/new | /sales/ar-invoices/from-delivery/:deliveryDocId | /sales/ar-invoices/:docId/edit
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import styled from 'styled-components';
import { Trash2, Plus } from 'lucide-react';
import { useAuthStore } from '../../stores/auth.store';
import { useArInvoice, useCreateArInvoice, useUpdateArInvoice, useCreateArInvoiceFromDelivery } from '../../hooks/queries/useArInvoices';
import { CustomerCombobox } from '../../components/sales/CustomerCombobox';
import { useTaxCodes } from '../../hooks/queries/useTaxCodes';
import { FALLBACK_TAX_CODES } from '../../services/taxCodesService';
import type { Customer } from '../../types/crm';
import type { ARInvoiceLineCreate } from '../../services/salesApi';

// ─── Zod schema ───────────────────────────────────────────────────────────────

const lineSchema = z.object({
  itemId: z.string().min(1, 'Item ID required'),
  itemCode: z.string().min(1, 'Item code required'),
  itemName: z.string().min(1, 'Item name required'),
  description: z.string().optional(),
  quantity: z.coerce.number().positive('Must be > 0'),
  uom: z.string().min(1, 'UoM required'),
  unitPrice: z.coerce.number().min(0, 'Must be ≥ 0'),
  discountPercent: z.coerce.number().min(0).max(100).default(0),
  taxCodeId: z.string().nullable().optional(),
  warehouseId: z.string().nullable().optional(),
  costCenterId: z.string().nullable().optional(),
});

const formSchema = z.object({
  companyCode: z.string().optional().default(''),
  customerId: z.string().min(1, 'Customer required'),
  customerName: z.string().min(1, 'Customer name required'),
  bpRefNo: z.string().nullable().optional(),
  docDate: z.string().min(1, 'Doc date required'),
  dateOfSupply: z.string().min(1, 'Date of supply required'),
  invoiceDate: z.string().min(1, 'Invoice date required'),
  paymentTermsId: z.string().nullable().optional(),
  currency: z.string().default('AED'),
  exchangeRate: z.coerce.number().positive().default(1),
  journalMemo: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  lines: z.array(lineSchema).min(1, 'At least one line required'),
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
  color: ${({ theme }) => theme.colors.primary[500]};
  font-size: 14px;
  cursor: pointer;
  padding: 0;
  margin-bottom: 20px;
  &:hover { text-decoration: underline; }
`;

const PageTitle = styled.h1`
  font-size: 26px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 32px 0;
`;

const Card = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 24px;
  box-shadow: ${({ theme }) => theme.shadows.sm};
`;

const CardTitle = styled.h2`
  font-size: 16px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 20px 0;
`;

const Grid = styled.div<{ $cols?: number }>`
  display: grid;
  grid-template-columns: repeat(${({ $cols }) => $cols ?? 3}, 1fr);
  gap: 16px;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const FieldGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const Label = styled.label`
  font-size: 13px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const Input = styled.input<{ $hasError?: boolean }>`
  padding: 10px 12px;
  border: 1px solid
    ${({ $hasError, theme }) =>
      $hasError ? theme.colors.error || '#ef4444' : theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.textPrimary};
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary[500]};
  }
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const Select = styled.select<{ $hasError?: boolean }>`
  padding: 10px 12px;
  border: 1px solid
    ${({ $hasError, theme }) =>
      $hasError ? theme.colors.error || '#ef4444' : theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.textPrimary};
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary[500]};
  }
`;

const Textarea = styled.textarea`
  padding: 10px 12px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.textPrimary};
  resize: vertical;
  min-height: 80px;
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary[500]};
  }
`;

const ErrorText = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.error || '#ef4444'};
`;

const LinesTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
`;

const LTh = styled.th`
  padding: 10px 12px;
  text-align: left;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: ${({ theme }) => theme.colors.textSecondary};
  background: ${({ theme }) => theme.colors.neutral[50]};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  white-space: nowrap;
`;

const LThRight = styled(LTh)`
  text-align: right;
`;

const LTd = styled.td`
  padding: 8px 10px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[100]};
  vertical-align: middle;
`;

const LTdRight = styled(LTd)`
  text-align: right;
  font-variant-numeric: tabular-nums;
`;

const LineInput = styled.input`
  width: 100%;
  padding: 6px 8px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 6px;
  font-size: 13px;
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.textPrimary};
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary[500]};
  }
`;

const LineSelect = styled.select`
  width: 100%;
  padding: 6px 8px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 6px;
  font-size: 13px;
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.textPrimary};
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary[500]};
  }
`;

const IconButton = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  color: ${({ theme }) => theme.colors.textSecondary};
  border-radius: 4px;
  display: flex;
  align-items: center;
  &:hover {
    color: ${({ theme }) => theme.colors.error || '#ef4444'};
    background: ${({ theme }) => theme.colors.neutral[100]};
  }
`;

const AddLineButton = styled.button`
  margin-top: 12px;
  padding: 8px 16px;
  background: transparent;
  color: ${({ theme }) => theme.colors.primary[500]};
  border: 1px dashed ${({ theme }) => theme.colors.primary[300]};
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  &:hover {
    background: ${({ theme }) => theme.colors.primary[50] || '#eff6ff'};
  }
`;

const TotalsCard = styled.div`
  background: ${({ theme }) => theme.colors.neutral[50]};
  border: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  border-radius: 8px;
  padding: 16px 20px;
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
`;

const TotalsRow = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 48px;
  font-size: 14px;
`;

const TotalsLabel = styled.span`
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const TotalsValue = styled.span`
  font-variant-numeric: tabular-nums;
  font-weight: 500;
`;

const TotalsGross = styled(TotalsRow)`
  font-size: 16px;
  font-weight: 700;
  border-top: 2px solid ${({ theme }) => theme.colors.neutral[300]};
  padding-top: 8px;
  margin-top: 4px;
`;

const ActionBar = styled.div`
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 32px;
`;

const PrimaryButton = styled.button`
  padding: 10px 24px;
  background: ${({ theme }) => theme.colors.primary[500]};
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  &:hover { background: ${({ theme }) => theme.colors.primary[700]}; }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

const SecondaryButton = styled.button`
  padding: 10px 24px;
  background: transparent;
  color: ${({ theme }) => theme.colors.textSecondary};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  &:hover { background: ${({ theme }) => theme.colors.neutral[100]}; }
`;

const ErrorBanner = styled.div`
  background: ${({ theme }) => theme.colors.errorBg || '#fef2f2'};
  color: ${({ theme }) => theme.colors.error || '#dc2626'};
  border: 1px solid #fecaca;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 20px;
  font-size: 14px;
`;

const InfoBanner = styled.div`
  background: ${({ theme }) => theme.colors.primary[50] || '#eff6ff'};
  color: ${({ theme }) => theme.colors.primary[700] || '#1d4ed8'};
  border: 1px solid ${({ theme }) => theme.colors.primary[200] || '#bfdbfe'};
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 20px;
  font-size: 14px;
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().split('T')[0];
}

function calcLineNet(qty: number, price: number, discount: number): number {
  const net = qty * price * (1 - discount / 100);
  return Math.round(net * 100) / 100;
}

function calcLineTax(lineNet: number, taxRate: number): number {
  return Math.round(lineNet * taxRate) / 100;
}

function formatAmount(value: number): string {
  return new Intl.NumberFormat('en-AE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

const EMPTY_LINE = {
  itemId: '',
  itemCode: '',
  itemName: '',
  description: '',
  quantity: 1,
  uom: 'EA',
  unitPrice: 0,
  discountPercent: 0,
  taxCodeId: null as string | null,
  warehouseId: null as string | null,
  costCenterId: null as string | null,
};

// ─── Component ────────────────────────────────────────────────────────────────

export function ARInvoiceFormPage() {
  const navigate = useNavigate();
  const { docId, deliveryDocId } = useParams<{
    docId?: string;
    deliveryDocId?: string;
  }>();
  const { user } = useAuthStore();
  const orgId = user?.organizationId ?? '';

  // Determine form mode
  const isEdit = Boolean(docId);
  const isFromDelivery = Boolean(deliveryDocId) && !docId;

  const pageTitle = isEdit
    ? 'Edit AR Invoice'
    : isFromDelivery
    ? `New AR Invoice from Delivery`
    : 'New AR Invoice';

  // Fetch existing invoice for edit mode
  const { data: existingInvoice, isLoading: loadingInvoice } = useArInvoice(
    isEdit ? docId : undefined,
    isEdit ? orgId : undefined,
  );

  // Mutations
  const createMutation = useCreateArInvoice();
  const updateMutation = useUpdateArInvoice();
  const fromDeliveryMutation = useCreateArInvoiceFromDelivery();

  const [submitError, setSubmitError] = useState<string | null>(null);

  // Tax codes
  const { data: fetchedTaxCodes } = useTaxCodes(orgId);
  const taxCodes = fetchedTaxCodes ?? FALLBACK_TAX_CODES;

  // React Hook Form setup
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
      bpRefNo: '',
      docDate: today(),
      dateOfSupply: today(),
      invoiceDate: today(),
      paymentTermsId: null,
      currency: 'AED',
      exchangeRate: 1,
      journalMemo: '',
      notes: '',
      lines: [{ ...EMPTY_LINE }],
    },
  });

  // Pre-fill form in edit mode once data is loaded
  useEffect(() => {
    if (isEdit && existingInvoice) {
      reset({
        companyCode: existingInvoice.companyCode,
        customerId: existingInvoice.customerId,
        customerName: existingInvoice.customerName,
        bpRefNo: existingInvoice.bpRefNo ?? '',
        docDate: existingInvoice.docDate,
        dateOfSupply: existingInvoice.dateOfSupply,
        invoiceDate: existingInvoice.invoiceDate,
        paymentTermsId: existingInvoice.paymentTermsId ?? null,
        currency: existingInvoice.currency,
        exchangeRate: existingInvoice.exchangeRate,
        journalMemo: existingInvoice.journalMemo ?? '',
        notes: existingInvoice.notes ?? '',
        lines: existingInvoice.lines.map((l) => ({
          itemId: l.itemId,
          itemCode: l.itemCode,
          itemName: l.itemName,
          description: l.description ?? '',
          quantity: Number(l.quantity),
          uom: l.uom,
          unitPrice: Number(l.unitPrice),
          discountPercent: Number(l.discountPercent),
          taxCodeId: l.taxCodeId ?? null,
          warehouseId: l.warehouseId ?? null,
          costCenterId: l.costCenterId ?? null,
        })),
      });
    }
  }, [isEdit, existingInvoice, reset]);

  // Field array for invoice lines
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'lines',
  });

  // Watch lines for computed totals
  const watchedLines = watch('lines');

  const totals = useMemo(() => {
    let net = 0;
    let tax = 0;
    for (const line of watchedLines) {
      const qty = Number(line.quantity) || 0;
      const price = Number(line.unitPrice) || 0;
      const disc = Number(line.discountPercent) || 0;
      const lineNet = calcLineNet(qty, price, disc);
      const taxCode = taxCodes.find((tc) => tc.taxCode === line.taxCodeId);
      const taxRate = taxCode ? parseFloat(taxCode.rate) : 0;
      const lineTax = calcLineTax(lineNet, taxRate);
      net += lineNet;
      tax += lineTax;
    }
    return {
      net: Math.round(net * 100) / 100,
      tax: Math.round(tax * 100) / 100,
      gross: Math.round((net + tax) * 100) / 100,
    };
  }, [watchedLines, taxCodes]);

  // Handle customer selection from CustomerCombobox
  const handleCustomerSelect = useCallback(
    (customer: Customer) => {
      setValue('customerId', customer.customerId, { shouldValidate: true });
      setValue('customerName', customer.name, { shouldValidate: true });
    },
    [setValue],
  );

  const handleCustomerClear = useCallback(() => {
    setValue('customerId', '', { shouldValidate: true });
    setValue('customerName', '', { shouldValidate: true });
  }, [setValue]);

  // Form submit
  const onSubmit = async (data: FormData) => {
    setSubmitError(null);
    try {
      const lines: ARInvoiceLineCreate[] = data.lines.map((l) => ({
        itemId: l.itemId,
        itemCode: l.itemCode,
        itemName: l.itemName,
        description: l.description || undefined,
        quantity: l.quantity,
        uom: l.uom,
        unitPrice: l.unitPrice,
        discountPercent: l.discountPercent,
        taxCodeId: l.taxCodeId || null,
        warehouseId: l.warehouseId || null,
        costCenterId: l.costCenterId || null,
      }));

      if (isEdit && docId) {
        const result = await updateMutation.mutateAsync({
          docId,
          data: {
            bpRefNo: data.bpRefNo || null,
            docDate: data.docDate,
            dateOfSupply: data.dateOfSupply,
            invoiceDate: data.invoiceDate,
            paymentTermsId: data.paymentTermsId || null,
            currency: data.currency,
            exchangeRate: data.exchangeRate,
            journalMemo: data.journalMemo || null,
            notes: data.notes || null,
            lines,
          },
          orgId,
        });
        navigate(`/sales/ar-invoices/${result.docEntry}`);
      } else if (isFromDelivery && deliveryDocId) {
        // For from-delivery mode: the backend handles the copy.
        // We send header overrides + line references.
        // Since we don't have the delivery line IDs available on the form
        // in this initial task, we call create-from-delivery with the
        // header data. The user will fill in line details manually.
        const result = await fromDeliveryMutation.mutateAsync({
          deliveryDocId,
          data: {
            companyCode: data.companyCode,
            bpRefNo: data.bpRefNo || null,
            docDate: data.docDate,
            invoiceDate: data.invoiceDate,
            dateOfSupply: data.dateOfSupply || null,
            paymentTermsId: data.paymentTermsId || null,
            currency: data.currency,
            exchangeRate: data.exchangeRate,
            journalMemo: data.journalMemo || null,
            notes: data.notes || null,
            lines: lines.map((l) => ({
              // For direct-line from delivery we need deliveryLineId.
              // This path is exercised when the user has pre-populated lines
              // from a prior Delivery fetch. In the base T-200.0 flow,
              // the form shows the header and the user confirms.
              deliveryLineId: l.baseDocRef?.lineId ?? '',
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              discountPercent: l.discountPercent,
              taxCodeId: l.taxCodeId || null,
              costCenterId: l.costCenterId || null,
            })),
          },
          orgId,
        });
        navigate(`/sales/ar-invoices/${result.docEntry}`);
      } else {
        // Direct create
        const result = await createMutation.mutateAsync({
          data: {
            companyCode: data.companyCode,
            customerId: data.customerId,
            customerName: data.customerName,
            bpRefNo: data.bpRefNo || null,
            docDate: data.docDate,
            dateOfSupply: data.dateOfSupply,
            invoiceDate: data.invoiceDate,
            paymentTermsId: data.paymentTermsId || null,
            currency: data.currency,
            exchangeRate: data.exchangeRate,
            journalMemo: data.journalMemo || null,
            notes: data.notes || null,
            lines,
          },
          orgId,
        });
        navigate(`/sales/ar-invoices/${result.docEntry}`);
      }
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'An unexpected error occurred. Please try again.';
      setSubmitError(msg);
    }
  };

  if (isEdit && loadingInvoice) {
    return (
      <Container>
        <BackLink onClick={() => navigate('/sales/ar-invoices')}>← AR Invoices</BackLink>
        <PageTitle>Loading…</PageTitle>
      </Container>
    );
  }

  const watchedCustomerId = watch('customerId');
  const watchedCustomerName = watch('customerName');

  return (
    <Container>
      <BackLink onClick={() => navigate('/sales/ar-invoices')} aria-label="Back to AR Invoices list">
        ← AR Invoices
      </BackLink>
      <PageTitle>{pageTitle}</PageTitle>

      {isFromDelivery && (
        <InfoBanner>
          Creating AR Invoice from Delivery <strong>{deliveryDocId}</strong>. The backend will
          inherit customer and item data from the source Delivery. Review and confirm the header
          details below, then click Save as Draft.
        </InfoBanner>
      )}

      {submitError && <ErrorBanner>{submitError}</ErrorBanner>}

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        {/* ── Header section ── */}
        <Card>
          <CardTitle>Header</CardTitle>
          <Grid $cols={3}>
            <FieldGroup>
              <Label htmlFor="companyCode">Company Code *</Label>
              <Input
                id="companyCode"
                $hasError={Boolean(errors.companyCode)}
                {...register('companyCode')}
              />
              {errors.companyCode && (
                <ErrorText>{errors.companyCode.message}</ErrorText>
              )}
            </FieldGroup>

            <FieldGroup style={{ gridColumn: 'span 2' }}>
              <Label>Customer *</Label>
              <Controller
                control={control}
                name="customerId"
                render={() => (
                  <CustomerCombobox
                    valueCustomerId={watchedCustomerId || null}
                    valueCustomerName={watchedCustomerName}
                    onCustomerSelect={handleCustomerSelect}
                    onClear={handleCustomerClear}
                    error={errors.customerId?.message}
                    disabled={isSubmitting}
                  />
                )}
              />
              {errors.customerId && !watchedCustomerId && (
                <ErrorText>{errors.customerId.message}</ErrorText>
              )}
            </FieldGroup>
          </Grid>

          <Grid $cols={3} style={{ marginTop: '16px' }}>
            <FieldGroup>
              <Label htmlFor="bpRefNo">BP Ref No (Customer PO #)</Label>
              <Input
                id="bpRefNo"
                placeholder="Customer's own reference"
                {...register('bpRefNo')}
              />
            </FieldGroup>

            <FieldGroup>
              <Label htmlFor="docDate">Doc Date *</Label>
              <Input
                id="docDate"
                type="date"
                $hasError={Boolean(errors.docDate)}
                {...register('docDate')}
              />
              {errors.docDate && (
                <ErrorText>{errors.docDate.message}</ErrorText>
              )}
            </FieldGroup>

            <FieldGroup>
              <Label htmlFor="dateOfSupply">Date of Supply *</Label>
              <Input
                id="dateOfSupply"
                type="date"
                $hasError={Boolean(errors.dateOfSupply)}
                {...register('dateOfSupply')}
              />
              {errors.dateOfSupply && (
                <ErrorText>{errors.dateOfSupply.message}</ErrorText>
              )}
            </FieldGroup>

            <FieldGroup>
              <Label htmlFor="invoiceDate">Invoice Date *</Label>
              <Input
                id="invoiceDate"
                type="date"
                $hasError={Boolean(errors.invoiceDate)}
                {...register('invoiceDate')}
              />
              {errors.invoiceDate && (
                <ErrorText>{errors.invoiceDate.message}</ErrorText>
              )}
            </FieldGroup>

            <FieldGroup>
              <Label htmlFor="currency">Currency</Label>
              <Select id="currency" {...register('currency')}>
                <option value="AED">AED</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
              </Select>
            </FieldGroup>

            <FieldGroup>
              <Label htmlFor="exchangeRate">Exchange Rate</Label>
              <Input
                id="exchangeRate"
                type="number"
                step="0.0001"
                $hasError={Boolean(errors.exchangeRate)}
                {...register('exchangeRate')}
              />
              {errors.exchangeRate && (
                <ErrorText>{errors.exchangeRate.message}</ErrorText>
              )}
            </FieldGroup>

            <FieldGroup style={{ gridColumn: 'span 3' }}>
              <Label htmlFor="journalMemo">Journal Memo</Label>
              <Input
                id="journalMemo"
                placeholder="GL journal memo (optional)"
                {...register('journalMemo')}
              />
            </FieldGroup>

            <FieldGroup style={{ gridColumn: 'span 3' }}>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                placeholder="Internal notes (not printed on invoice)"
                {...register('notes')}
              />
            </FieldGroup>
          </Grid>
        </Card>

        {/* ── Lines section ── */}
        <Card>
          <CardTitle>Invoice Lines</CardTitle>
          {errors.lines?.root && (
            <ErrorText style={{ display: 'block', marginBottom: '12px' }}>
              {errors.lines.root.message}
            </ErrorText>
          )}
          {errors.lines?.message && (
            <ErrorText style={{ display: 'block', marginBottom: '12px' }}>
              {errors.lines.message as string}
            </ErrorText>
          )}

          <div style={{ overflowX: 'auto' }}>
            <LinesTable>
              <thead>
                <tr>
                  <LTh style={{ minWidth: '80px' }}>Item Code</LTh>
                  <LTh style={{ minWidth: '160px' }}>Description</LTh>
                  <LThRight style={{ minWidth: '80px' }}>Qty</LThRight>
                  <LTh style={{ minWidth: '60px' }}>UoM</LTh>
                  <LThRight style={{ minWidth: '100px' }}>Unit Price</LThRight>
                  <LThRight style={{ minWidth: '80px' }}>Disc %</LThRight>
                  <LThRight style={{ minWidth: '100px' }}>Line Net</LThRight>
                  <LTh style={{ minWidth: '80px' }}>Tax Code</LTh>
                  <LThRight style={{ minWidth: '90px' }}>Tax Amt</LThRight>
                  <LThRight style={{ minWidth: '100px' }}>Line Gross</LThRight>
                  <LTh style={{ minWidth: '40px' }}></LTh>
                </tr>
              </thead>
              <tbody>
                {fields.map((field, index) => {
                  const line = watchedLines[index] ?? {};
                  const qty = Number(line.quantity) || 0;
                  const price = Number(line.unitPrice) || 0;
                  const disc = Number(line.discountPercent) || 0;
                  const lineNet = calcLineNet(qty, price, disc);
                  const taxCode = taxCodes.find(
                    (tc) => tc.taxCode === line.taxCodeId,
                  );
                  const taxRate = taxCode ? parseFloat(taxCode.rate) : 0;
                  const lineTax = calcLineTax(lineNet, taxRate);
                  const lineGross = Math.round((lineNet + lineTax) * 100) / 100;

                  return (
                    <tr key={field.id}>
                      <LTd>
                        <LineInput
                          {...register(`lines.${index}.itemCode`)}
                          placeholder="Code"
                          aria-label={`Line ${index + 1} item code`}
                        />
                        {/* Hidden itemId and itemName — fill alongside itemCode */}
                        <input
                          type="hidden"
                          {...register(`lines.${index}.itemId`)}
                        />
                        <LineInput
                          {...register(`lines.${index}.itemName`)}
                          placeholder="Name"
                          style={{ marginTop: '4px' }}
                          aria-label={`Line ${index + 1} item name`}
                        />
                      </LTd>
                      <LTd>
                        <LineInput
                          {...register(`lines.${index}.description`)}
                          placeholder="Description"
                          aria-label={`Line ${index + 1} description`}
                        />
                      </LTd>
                      <LTdRight>
                        <LineInput
                          type="number"
                          step="0.001"
                          {...register(`lines.${index}.quantity`)}
                          style={{ textAlign: 'right' }}
                          aria-label={`Line ${index + 1} quantity`}
                        />
                      </LTdRight>
                      <LTd>
                        <LineInput
                          {...register(`lines.${index}.uom`)}
                          placeholder="EA"
                          aria-label={`Line ${index + 1} unit of measure`}
                        />
                      </LTd>
                      <LTdRight>
                        <LineInput
                          type="number"
                          step="0.01"
                          {...register(`lines.${index}.unitPrice`)}
                          style={{ textAlign: 'right' }}
                          aria-label={`Line ${index + 1} unit price`}
                        />
                      </LTdRight>
                      <LTdRight>
                        <LineInput
                          type="number"
                          step="0.01"
                          {...register(`lines.${index}.discountPercent`)}
                          style={{ textAlign: 'right' }}
                          aria-label={`Line ${index + 1} discount percent`}
                        />
                      </LTdRight>
                      <LTdRight>
                        <span>{formatAmount(lineNet)}</span>
                      </LTdRight>
                      <LTd>
                        <Controller
                          control={control}
                          name={`lines.${index}.taxCodeId`}
                          render={({ field: f }) => (
                            <LineSelect
                              value={f.value ?? ''}
                              onChange={(e) =>
                                f.onChange(e.target.value || null)
                              }
                              aria-label={`Line ${index + 1} tax code`}
                            >
                              <option value="">—</option>
                              {taxCodes
                                .filter((tc) => tc.isActive)
                                .map((tc) => (
                                  <option key={tc.taxCode} value={tc.taxCode}>
                                    {tc.taxCode} ({tc.rate}%)
                                  </option>
                                ))}
                            </LineSelect>
                          )}
                        />
                      </LTd>
                      <LTdRight>
                        <span>{formatAmount(lineTax)}</span>
                      </LTdRight>
                      <LTdRight>
                        <strong>{formatAmount(lineGross)}</strong>
                      </LTdRight>
                      <LTd>
                        {fields.length > 1 && (
                          <IconButton
                            type="button"
                            onClick={() => remove(index)}
                            aria-label={`Remove line ${index + 1}`}
                          >
                            <Trash2 size={15} />
                          </IconButton>
                        )}
                      </LTd>
                    </tr>
                  );
                })}
              </tbody>
            </LinesTable>
          </div>

          <AddLineButton
            type="button"
            onClick={() => append({ ...EMPTY_LINE })}
            aria-label="Add invoice line"
          >
            <Plus size={15} />
            Add Line
          </AddLineButton>

          <TotalsCard>
            <TotalsRow>
              <TotalsLabel>Net Amount</TotalsLabel>
              <TotalsValue>{formatAmount(totals.net)} AED</TotalsValue>
            </TotalsRow>
            <TotalsRow>
              <TotalsLabel>Tax Amount</TotalsLabel>
              <TotalsValue>{formatAmount(totals.tax)} AED</TotalsValue>
            </TotalsRow>
            <TotalsGross>
              <TotalsLabel>Total (Gross)</TotalsLabel>
              <TotalsValue>{formatAmount(totals.gross)} AED</TotalsValue>
            </TotalsGross>
          </TotalsCard>
        </Card>

        <ActionBar>
          <SecondaryButton
            type="button"
            onClick={() => navigate('/sales/ar-invoices')}
          >
            Cancel
          </SecondaryButton>
          <PrimaryButton type="submit" disabled={isSubmitting}>
            {isSubmitting
              ? 'Saving…'
              : isEdit
              ? 'Save Changes'
              : 'Save as Draft'}
          </PrimaryButton>
        </ActionBar>
      </form>
    </Container>
  );
}

export default ARInvoiceFormPage;
